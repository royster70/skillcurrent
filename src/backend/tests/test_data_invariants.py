"""Tests that verify loaded data meets domain invariants.

These are integration tests against real data in the database.
They validate the rules documented in docs/domain-model.md.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def test_eloundou_e0_gte_max_e1_e2(session: AsyncSession):
    """E0 >= max(E1, E2) for all rows in eloundou_occ_scores (both rater types).

    This is a hard invariant from the Eloundou 2024 paper.
    Violations indicate data quality issues.
    """
    result = await session.execute(
        text("""
            SELECT COUNT(*) AS violations
            FROM eloundou_occ_scores
            WHERE
                (dv_e0_gamma < GREATEST(dv_e1_alpha, dv_e2_beta))
                OR
                (human_e0_gamma < GREATEST(human_e1_alpha, human_e2_beta))
        """)
    )
    violations = result.scalar_one()
    assert violations == 0, f"Found {violations} rows where E0 < max(E1, E2)"


async def test_eloundou_dwa_weights_sum_to_one(session: AsyncSession):
    """importance_weight sums to ~1.0 per occupation in eloundou_dwa_scores.

    Uses a tolerance of 0.01 to account for floating-point rounding.
    """
    result = await session.execute(
        text("""
            SELECT onet_soc, ABS(SUM(importance_weight) - 1.0) AS deviation
            FROM eloundou_dwa_scores
            GROUP BY onet_soc
            HAVING ABS(SUM(importance_weight) - 1.0) > 0.01
        """)
    )
    bad_rows = result.fetchall()
    assert len(bad_rows) == 0, (
        f"Found {len(bad_rows)} occupations where importance_weight does not sum to 1.0. "
        f"First few: {bad_rows[:5]}"
    )


async def test_eloundou_dwa_coverage(session: AsyncSession):
    """At least 99% of onet_dwa_references have scores in eloundou_dwa_scores."""
    result = await session.execute(
        text("""
            SELECT
                (SELECT COUNT(DISTINCT dwa_id) FROM onet_dwa_references) AS total_dwas,
                (SELECT COUNT(DISTINCT dwa_id) FROM eloundou_dwa_scores) AS scored_dwas
        """)
    )
    row = result.one()
    total = row.total_dwas
    scored = row.scored_dwas
    if total == 0:
        pytest.skip("No DWA references loaded")
    coverage = scored / total
    assert coverage >= 0.99, (
        f"DWA coverage is {coverage:.2%} ({scored}/{total}), expected >= 99%"
    )


async def test_onet_soc_code_format(session: AsyncSession):
    """All onet_occupations.onet_soc match 'XX-XXXX.XX' pattern."""
    result = await session.execute(
        text(r"""
            SELECT COUNT(*) AS bad_codes
            FROM onet_occupations
            WHERE onet_soc !~ '^[0-9]{2}-[0-9]{4}\.[0-9]{2}$'
        """)
    )
    bad_codes = result.scalar_one()
    assert bad_codes == 0, f"Found {bad_codes} SOC codes not matching XX-XXXX.XX format"


async def test_aei_temporal_model_eras(session: AsyncSession):
    """All 4 expected model eras exist in aei_task_snapshots."""
    result = await session.execute(
        text("""
            SELECT DISTINCT model_era
            FROM aei_task_snapshots
            ORDER BY model_era
        """)
    )
    eras = [row[0] for row in result.fetchall()]
    expected = {"sonnet-3.5", "sonnet-3.7", "sonnet-4", "sonnet-4.5"}
    missing = expected - set(eras)
    assert len(missing) == 0, (
        f"Missing model eras: {missing}. Found: {eras}"
    )


async def test_dataset_versions_no_duplicates(session: AsyncSession):
    """No duplicate (dataset_name, version_key) pairs in dataset_versions."""
    result = await session.execute(
        text("""
            SELECT dataset_name, version_key, COUNT(*) AS cnt
            FROM dataset_versions
            GROUP BY dataset_name, version_key
            HAVING COUNT(*) > 1
        """)
    )
    dupes = result.fetchall()
    assert len(dupes) == 0, (
        f"Found duplicate dataset versions: {dupes}"
    )


async def test_ms_ai_iwa_coverage(session: AsyncSession):
    """All 332 ms_ai_iwa_metrics.iwa_code match onet_dwa_references.iwa_id."""
    result = await session.execute(
        text("""
            SELECT COUNT(*) AS unmatched
            FROM ms_ai_iwa_metrics m
            LEFT JOIN onet_dwa_references d ON m.iwa_code = d.iwa_id
            WHERE d.iwa_id IS NULL
        """)
    )
    unmatched = result.scalar_one()
    assert unmatched == 0, (
        f"Found {unmatched} IWA codes in ms_ai_iwa_metrics with no match in onet_dwa_references"
    )

    # Also verify we have exactly 332 IWA codes
    result2 = await session.execute(
        text("SELECT COUNT(DISTINCT iwa_code) FROM ms_ai_iwa_metrics")
    )
    iwa_count = result2.scalar_one()
    assert iwa_count == 332, f"Expected 332 IWA codes, found {iwa_count}"


# ── GDPval Data Invariants ──


async def test_gdpval_tasks_all_have_soc(session: AsyncSession):
    """All GDPval tasks must have onet_soc mapped."""
    result = await session.execute(
        text("SELECT COUNT(*) FROM gdpval_tasks WHERE onet_soc IS NULL")
    )
    unmapped = result.scalar_one()
    assert unmapped == 0, f"{unmapped} GDPval tasks lack SOC mapping"


async def test_gdpval_rubric_coverage(session: AsyncSession):
    """Every GDPval task must have at least one rubric item."""
    result = await session.execute(
        text("""
            SELECT COUNT(*) FROM gdpval_tasks gt
            WHERE NOT EXISTS (
                SELECT 1 FROM gdpval_rubric_items ri WHERE ri.task_id = gt.task_id
            )
        """)
    )
    orphaned = result.scalar_one()
    assert orphaned == 0, f"{orphaned} GDPval tasks lack rubric items"


async def test_gdpval_scores_finite(session: AsyncSession):
    """All scores in gdpval_rubric_items are finite (NaN/Inf not allowed).

    Note: negative scores are valid — GDPval uses them as penalty deductions.
    """
    result = await session.execute(
        text("""
            SELECT COUNT(*) FROM gdpval_rubric_items
            WHERE score IS NOT NULL
              AND (score = 'NaN'::float OR score = 'Infinity'::float OR score = '-Infinity'::float)
        """)
    )
    invalid = result.scalar_one()
    assert invalid == 0, f"{invalid} rubric items have non-finite scores"


async def test_aei_snapshots_automation_range(session: AsyncSession):
    """automation_pct and augmentation_pct in [0,1] when not null."""
    result = await session.execute(
        text("""
            SELECT COUNT(*) FROM aei_task_snapshots
            WHERE (automation_pct IS NOT NULL AND (automation_pct < 0 OR automation_pct > 1))
               OR (augmentation_pct IS NOT NULL AND (augmentation_pct < 0 OR augmentation_pct > 1))
        """)
    )
    violations = result.scalar_one()
    assert violations == 0, (
        f"{violations} AEI snapshots have automation/augmentation pct outside [0,1]"
    )
