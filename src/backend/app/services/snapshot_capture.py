"""Capture a snapshot of the platform's derived readings (ADR-012).

Reads the current live verdict tables and APPENDS a compact per-entity copy
into exposure_snapshots, anchored to a new snapshot_runs row. Append-only: no
existing snapshot row is ever mutated, so running it repeatedly builds history.

Runs as the terminal `snapshot_derived_products` pipeline stage (so each
recompute is captured, tagged with the active pipeline_run_id) and is also
callable ad-hoc via `python -m scripts.capture_snapshot`.

The zone thresholds mirror the single source of truth used everywhere else
(occupations.py, build_static_site.py): E2 ≥ 0.85, E1 ≥ 0.40, else E0.
"""

import json
import logging
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.correlation import pipeline_run_id_var
from app.services.transformations import tracked_transformation

logger = logging.getLogger(__name__)

# Zone from β — kept as a SQL fragment so each capture computes it identically
# to the API/static build (never re-derive the thresholds elsewhere).
_ZONE_CASE = "CASE WHEN {b} >= 0.85 THEN 'E2' WHEN {b} >= 0.40 THEN 'E1' ELSE 'E0' END"


async def _create_run(
    session: AsyncSession, as_of: date, label: str | None, is_release: bool
) -> int:
    """Insert the snapshot_runs anchor and return its id. Stamps the active
    pipeline_run_id and the current dataset vintages (ADR-002 provenance)."""
    # Latest version per dataset (datasets accrue history, ADR-002) — must match
    # _current_register so the release change-guard compares like for like.
    versions = (
        await session.execute(
            text(
                "SELECT DISTINCT ON (dataset_name) dataset_name, version_key "
                "FROM dataset_versions ORDER BY dataset_name, id DESC"
            )
        )
    ).all()
    input_versions = {name: ver for name, ver in versions}
    onet_version = input_versions.get("onet") or input_versions.get("O*NET")
    run_id = pipeline_run_id_var.get("") or None
    row = await session.execute(
        text(
            """
            INSERT INTO snapshot_runs
                (as_of_date, pipeline_run_id, label, is_release, input_versions, onet_version)
            VALUES (:as_of, :prid, :label, :is_release, CAST(:versions AS jsonb), :onet)
            RETURNING id
            """
        ),
        {
            "as_of": as_of,
            "prid": run_id,
            "label": label,
            "is_release": is_release,
            "versions": json.dumps(input_versions),
            "onet": onet_version,
        },
    )
    return int(row.scalar_one())


async def _snap_occupations(session: AsyncSession, run_id: int) -> None:
    """US occupation β + zone (from eloundou_occ_scores — the on-the-fly US
    verdict has no live table, so read the source it's computed from)."""
    await session.execute(
        text(
            f"""
            INSERT INTO exposure_snapshots
                (snapshot_run_id, entity_type, entity_key, region, beta, zone)
            SELECT :run_id, 'occupation', onet_soc, 'US', dv_beta_derived,
                   {_ZONE_CASE.format(b="dv_beta_derived")}
            FROM eloundou_occ_scores
            WHERE dv_beta_derived IS NOT NULL
            """
        ),
        {"run_id": run_id},
    )


async def _snap_sector_occupations(session: AsyncSession, run_id: int) -> None:
    """Sector×occupation weighted β / zone / drift (industry_occupation_profiles)."""
    await session.execute(
        text(
            """
            INSERT INTO exposure_snapshots
                (snapshot_run_id, entity_type, entity_key, region,
                 beta, zone, drift_velocity, drift_classification)
            SELECT :run_id, 'sector_occupation', naics_code || ':' || onet_soc, region,
                   eloundou_beta, dominant_zone, drift_velocity, drift_classification
            FROM industry_occupation_profiles
            """
        ),
        {"run_id": run_id},
    )


async def _snap_tasks(session: AsyncSession, run_id: int) -> None:
    """Task drift velocity + classification (task_drift_metrics). Platform-global."""
    await session.execute(
        text(
            """
            INSERT INTO exposure_snapshots
                (snapshot_run_id, entity_type, entity_key, region,
                 drift_velocity, drift_classification)
            SELECT :run_id, 'task', task_text, 'GLOBAL', velocity, classification
            FROM task_drift_metrics
            """
        ),
        {"run_id": run_id},
    )


async def _snap_au_occupations(session: AsyncSession, run_id: int) -> None:
    """AU occupation β + zone + divergence (au_occupation_exposure). Optional:
    the table may be empty if the AU overlay wasn't built."""
    await session.execute(
        text(
            f"""
            INSERT INTO exposure_snapshots
                (snapshot_run_id, entity_type, entity_key, region, beta, zone, extra)
            SELECT :run_id, 'au_occupation', osca_code, 'AU', au_task_beta,
                   CASE WHEN au_task_beta IS NULL THEN NULL
                        ELSE {_ZONE_CASE.format(b="au_task_beta")} END,
                   jsonb_build_object(
                       'us_task_beta', us_task_beta,
                       'divergence', divergence,
                       'coverage_pct', coverage_pct)
            FROM au_occupation_exposure
            """
        ),
        {"run_id": run_id},
    )


@tracked_transformation(
    name="snapshot_derived_products",
    sources=[
        "eloundou_occ_scores",
        "industry_occupation_profiles",
        "task_drift_metrics",
        "au_occupation_exposure",
    ],
    target="exposure_snapshots",
)
async def _capture(
    session: AsyncSession,
    *,
    as_of_iso: str | None = None,
    label: str | None = None,
    is_release: bool = False,
) -> int:
    """Append one full snapshot of the derived verdicts. Returns rows written."""
    as_of = date.fromisoformat(as_of_iso) if as_of_iso else date.today()
    run_id = await _create_run(session, as_of, label, is_release)
    for snap in (_snap_occupations, _snap_sector_occupations, _snap_tasks, _snap_au_occupations):
        await snap(session, run_id)
    total = int(
        (
            await session.execute(
                text("SELECT count(*) FROM exposure_snapshots WHERE snapshot_run_id = :run_id"),
                {"run_id": run_id},
            )
        ).scalar_one()
    )
    logger.info(
        "snapshot %s captured: %s verdict rows (as_of=%s, release=%s)",
        run_id,
        total,
        as_of,
        is_release,
    )
    return total


async def capture_snapshot(
    session: AsyncSession,
    *,
    as_of_iso: str | None = None,
    label: str | None = None,
    is_release: bool = False,
) -> int:
    """Public entry — capture a snapshot of all derived verdicts. Returns the
    number of exposure_snapshots rows written."""
    return int(await _capture(session, as_of_iso=as_of_iso, label=label, is_release=is_release))


# ── Releases (ADR-012) ────────────────────────────────────────────────────────
# A release is a snapshot cut when a new DATA release lands — tied to the
# dataset_versions register (ADR-002). Expected rhythm is quarterly; the trigger
# is a genuine change in the register, not the calendar. Cutting a release also
# records the dataset-version delta (which sources got new versions) so the
# release is self-describing: "what data changed" + "what readings changed".


def _quarter_label(d: date) -> str:
    """Calendar-quarter label, e.g. 2026-Q3."""
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


async def _current_register(session: AsyncSession) -> dict[str, tuple[str, int]]:
    """The CURRENT dataset_versions register: {dataset_name: (version_key, id)}.
    Datasets accrue version history (ADR-002), so take the latest row per name."""
    rows = (
        await session.execute(
            text(
                "SELECT DISTINCT ON (dataset_name) dataset_name, version_key, id "
                "FROM dataset_versions ORDER BY dataset_name, id DESC"
            )
        )
    ).all()
    return {name: (key, vid) for name, key, vid in rows}


async def _last_release_versions(session: AsyncSession) -> dict[str, str] | None:
    """input_versions of the most recent release, or None if none cut yet."""
    row = (
        await session.execute(
            text(
                "SELECT input_versions FROM snapshot_runs "
                "WHERE is_release = true ORDER BY id DESC LIMIT 1"
            )
        )
    ).first()
    if not row or row[0] is None:
        return None
    return dict(row[0])


async def _resolve_version_id(session: AsyncSession, name: str, key: str) -> int | None:
    """dataset_versions.id for a (name, version_key), if that row still exists."""
    row = (
        await session.execute(
            text("SELECT id FROM dataset_versions WHERE dataset_name = :n AND version_key = :k"),
            {"n": name, "k": key},
        )
    ).first()
    return int(row[0]) if row else None


async def _record_version_deltas(
    session: AsyncSession, changed: dict[str, tuple[str | None, str, int]], label: str
) -> int:
    """Register each changed dataset as a dataset_version_deltas row (ADR-002).
    from_version_id resolves when the prior version row survives; the transition
    is always captured in delta_detail regardless."""
    for name, (from_key, to_key, to_id) in changed.items():
        from_id = await _resolve_version_id(session, name, from_key) if from_key else None
        await session.execute(
            text(
                """
                INSERT INTO dataset_version_deltas
                    (dataset_name, from_version_id, to_version_id, delta_detail)
                VALUES (:name, :from_id, :to_id, CAST(:detail AS jsonb))
                """
            ),
            {
                "name": name,
                "from_id": from_id,
                "to_id": to_id,
                "detail": json.dumps({"from_key": from_key, "to_key": to_key, "release": label}),
            },
        )
    return len(changed)


async def cut_release(
    session: AsyncSession,
    *,
    as_of_iso: str | None = None,
    label: str | None = None,
    force: bool = False,
) -> dict[str, object]:
    """Cut a quarterly data release: a labelled, is_release snapshot plus the
    dataset-version delta since the last release.

    Guarded: if the dataset register is unchanged since the last release (no new
    data), the release is SKIPPED unless ``force`` — so re-runs on identical
    inputs don't mint empty releases. Auto-labels by quarter when no label given.
    """
    as_of = date.fromisoformat(as_of_iso) if as_of_iso else date.today()
    label = label or _quarter_label(as_of)
    register = await _current_register(session)
    last = await _last_release_versions(session)

    changed: dict[str, tuple[str | None, str, int]] = {}
    for name, (key, vid) in register.items():
        from_key = last.get(name) if last else None
        if last is None or from_key != key:
            changed[name] = (from_key, key, vid)

    if last is not None and not changed and not force:
        logger.warning(
            "release %s skipped — dataset register unchanged since last release "
            "(use force to cut anyway)",
            label,
        )
        return {"skipped": True, "label": label, "reason": "no dataset version change"}

    rows = await capture_snapshot(
        session, as_of_iso=as_of.isoformat(), label=label, is_release=True
    )
    deltas = await _record_version_deltas(session, changed, label)
    logger.info("release %s cut: %s verdict rows, %s dataset-version delta(s)", label, rows, deltas)
    return {
        "skipped": False,
        "label": label,
        "rows": rows,
        "dataset_deltas": deltas,
        "changed": sorted(changed),
    }
