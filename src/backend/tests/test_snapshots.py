"""Tests for the temporal snapshot layer (ADR-012).

Integration tests against the real seeded DB (like test_data_invariants). They
verify the capture is faithful to the live tables, zones are computed on the
canonical thresholds, and — the load-bearing property — that the layer is
append-only, so history accumulates and can be diffed. Each runs inside the
rolled-back session fixture, so captured rows never persist.
"""

from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.snapshot_capture import _quarter_label, capture_snapshot, cut_release


async def _has_seed(session: AsyncSession) -> bool:
    n = (await session.execute(text("SELECT count(*) FROM eloundou_occ_scores"))).scalar_one()
    return bool(n)


async def test_capture_matches_source_counts(session: AsyncSession):
    """Each entity_type row count equals the live source table it snapshots."""
    if not await _has_seed(session):
        pytest.skip("derived data not populated")

    total = await capture_snapshot(session, label="test")
    assert total > 0

    # Scope to THIS run — the DB may already hold committed snapshots.
    run_id = (await session.execute(text("SELECT max(id) FROM snapshot_runs"))).scalar_one()
    counts = dict(
        (
            await session.execute(
                text(
                    "SELECT entity_type, count(*) FROM exposure_snapshots "
                    "WHERE snapshot_run_id = :r GROUP BY 1"
                ),
                {"r": run_id},
            )
        ).all()
    )
    occ = (
        await session.execute(
            text("SELECT count(*) FROM eloundou_occ_scores WHERE dv_beta_derived IS NOT NULL")
        )
    ).scalar_one()
    sect = (
        await session.execute(text("SELECT count(*) FROM industry_occupation_profiles"))
    ).scalar_one()
    tasks = (await session.execute(text("SELECT count(*) FROM task_drift_metrics"))).scalar_one()

    assert counts.get("occupation") == occ
    assert counts.get("sector_occupation") == sect
    assert counts.get("task") == tasks
    # AU is optional — present iff the overlay was built.
    au = (await session.execute(text("SELECT count(*) FROM au_occupation_exposure"))).scalar_one()
    assert counts.get("au_occupation", 0) == au


async def test_zone_matches_beta_thresholds(session: AsyncSession):
    """Every captured zone must agree with the canonical β thresholds
    (E2 ≥ 0.85, E1 ≥ 0.40, else E0) — snapshots never re-derive them."""
    if not await _has_seed(session):
        pytest.skip("derived data not populated")

    await capture_snapshot(session)
    mismatches = (
        await session.execute(
            text(
                """
                SELECT count(*) FROM exposure_snapshots
                WHERE beta IS NOT NULL AND zone IS NOT NULL AND zone <> CASE
                    WHEN beta >= 0.85 THEN 'E2'
                    WHEN beta >= 0.40 THEN 'E1'
                    ELSE 'E0' END
                """
            )
        )
    ).scalar_one()
    assert mismatches == 0


async def test_append_only_history_accumulates(session: AsyncSession):
    """A second capture must ADD rows and never mutate the first snapshot —
    this is what makes a 'what changed since' diff possible."""
    if not await _has_seed(session):
        pytest.skip("derived data not populated")

    n1 = await capture_snapshot(session, label="first")
    run1 = (await session.execute(text("SELECT max(id) FROM snapshot_runs"))).scalar_one()
    n2 = await capture_snapshot(session, label="second")
    run2 = (await session.execute(text("SELECT max(id) FROM snapshot_runs"))).scalar_one()

    assert run2 > run1
    # First run's rows are untouched.
    still = (
        await session.execute(
            text("SELECT count(*) FROM exposure_snapshots WHERE snapshot_run_id = :r"),
            {"r": run1},
        )
    ).scalar_one()
    assert still == n1
    # Second run added its own full set.
    added = (
        await session.execute(
            text("SELECT count(*) FROM exposure_snapshots WHERE snapshot_run_id = :r"),
            {"r": run2},
        )
    ).scalar_one()
    assert added == n2

    # And the two are joinable for a diff (identical data → zero moves).
    moves = (
        await session.execute(
            text(
                """
                WITH a AS (SELECT entity_key, zone FROM exposure_snapshots
                           WHERE snapshot_run_id = :r1 AND entity_type = 'occupation'),
                     b AS (SELECT entity_key, zone FROM exposure_snapshots
                           WHERE snapshot_run_id = :r2 AND entity_type = 'occupation')
                SELECT count(*) FILTER (WHERE a.zone <> b.zone)
                FROM a JOIN b USING (entity_key)
                """
            ),
            {"r1": run1, "r2": run2},
        )
    ).scalar_one()
    assert moves == 0


async def test_snapshot_run_carries_provenance(session: AsyncSession):
    """Each run stamps the input dataset vintages + optional release label."""
    if not await _has_seed(session):
        pytest.skip("derived data not populated")

    await capture_snapshot(session, label="2026-Q3", is_release=True)
    row = (
        await session.execute(
            text(
                "SELECT label, is_release, onet_version, input_versions "
                "FROM snapshot_runs ORDER BY id DESC LIMIT 1"
            )
        )
    ).one()
    label, is_release, onet_version, input_versions = row
    assert label == "2026-Q3"
    assert is_release is True
    assert onet_version  # e.g. "28.1"
    assert input_versions and len(input_versions) > 0


# ── Releases ──


def test_quarter_label_maps_month_to_quarter():
    assert _quarter_label(date(2026, 1, 15)) == "2026-Q1"
    assert _quarter_label(date(2026, 7, 17)) == "2026-Q3"
    assert _quarter_label(date(2026, 12, 31)) == "2026-Q4"


async def test_cut_release_labels_quarter_and_registers_deltas(session: AsyncSession):
    """The first release auto-labels by quarter, marks is_release, and registers
    every dataset in the version register as a dataset_version_delta."""
    if not await _has_seed(session):
        pytest.skip("derived data not populated")

    # Distinct datasets (they accrue version history — count names, not rows).
    datasets = (
        await session.execute(text("SELECT count(DISTINCT dataset_name) FROM dataset_versions"))
    ).scalar_one()
    result = await cut_release(session, as_of_iso="2026-07-17")

    assert result["skipped"] is False
    assert result["label"] == "2026-Q3"
    assert result["dataset_deltas"] == datasets  # first release → all are "new"

    run = (
        await session.execute(
            text("SELECT is_release, label FROM snapshot_runs ORDER BY id DESC LIMIT 1")
        )
    ).one()
    assert run[0] is True and run[1] == "2026-Q3"


async def test_release_guard_skips_when_register_unchanged(session: AsyncSession):
    """A second release with no dataset-version change is skipped (no empty
    releases), unless forced."""
    if not await _has_seed(session):
        pytest.skip("derived data not populated")

    await cut_release(session, as_of_iso="2026-07-17")
    again = await cut_release(session, as_of_iso="2026-07-17")
    assert again["skipped"] is True

    forced = await cut_release(session, as_of_iso="2026-07-17", force=True)
    assert forced["skipped"] is False


async def test_release_detects_a_new_data_version(session: AsyncSession):
    """When a dataset publishes a new version, the next release is not skipped
    and its delta names exactly the changed dataset."""
    if not await _has_seed(session):
        pytest.skip("derived data not populated")

    await cut_release(session, as_of_iso="2026-07-17")
    # Simulate a data release: bump one dataset's version (rolled back after).
    await session.execute(
        text("UPDATE dataset_versions SET version_key = 'test-next' WHERE dataset_name = 'onet'")
    )
    nxt = await cut_release(session, as_of_iso="2026-10-01")

    assert nxt["skipped"] is False
    assert nxt["label"] == "2026-Q4"
    assert nxt["changed"] == ["onet"]
    assert nxt["dataset_deltas"] == 1
