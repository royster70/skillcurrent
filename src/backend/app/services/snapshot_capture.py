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
    versions = (
        await session.execute(
            text("SELECT dataset_name, version_key FROM dataset_versions ORDER BY dataset_name")
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
