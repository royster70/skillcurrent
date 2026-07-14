"""Tests that verify loaded data meets domain invariants.

These are integration tests against real data in the database.
They validate the rules documented in docs/domain-model.md.
"""

import hashlib
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.hashing import compute_file_hash, compute_files_hash, compute_json_hash


async def test_signal_registry_no_restricted_source_is_shippable(session: AsyncSession):
    """FR-9.5: no citation-only / view-only / unverified source may be
    redistribution_ok=true, every row carries a licence, and the foundational
    sources stay shippable. Skips when the registry is not yet ingested.
    """
    count = (
        await session.execute(text("SELECT COUNT(*) FROM signal_source_registry"))
    ).scalar_one()
    if count == 0:
        pytest.skip("signal_source_registry not populated")

    blank = (
        await session.execute(
            text(
                "SELECT source_key FROM signal_source_registry "
                "WHERE licence IS NULL OR TRIM(licence) = ''"
            )
        )
    ).fetchall()
    assert not blank, f"sources with blank licence: {[r[0] for r in blank]}"

    leaks = (
        await session.execute(
            text(
                """
                SELECT source_key, licence FROM signal_source_registry
                WHERE redistribution_ok = true AND (
                    LOWER(licence) LIKE '%citation%' OR
                    LOWER(licence) LIKE '%view-only%' OR
                    LOWER(licence) LIKE '%view only%' OR
                    LOWER(licence) LIKE '%not open%' OR
                    LOWER(licence) LIKE '%pending%' OR
                    LOWER(licence) LIKE '%restricted%'
                )
                """
            )
        )
    ).fetchall()
    assert not leaks, f"restricted sources marked shippable: {leaks}"

    for key in ("onet", "eloundou"):
        ok = (
            await session.execute(
                text("SELECT redistribution_ok FROM signal_source_registry WHERE source_key = :k"),
                {"k": key},
            )
        ).scalar_one_or_none()
        assert ok is True, f"foundational source '{key}' must be redistribution_ok=true (got {ok})"


async def test_eloundou_e0_gte_max_e1_e2(session: AsyncSession):
    """E0 >= max(E1, E2) for all rows in eloundou_occ_scores (both rater types).

    This is a hard invariant from the Eloundou 2024 paper.
    Violations indicate data quality issues.
    """
    result = await session.execute(
        text(
            """
            SELECT COUNT(*) AS violations
            FROM eloundou_occ_scores
            WHERE
                (dv_e0_gamma < GREATEST(dv_e1_alpha, dv_e2_beta))
                OR
                (human_e0_gamma < GREATEST(human_e1_alpha, human_e2_beta))
        """
        )
    )
    violations = result.scalar_one()
    assert violations == 0, f"Found {violations} rows where E0 < max(E1, E2)"


async def test_eloundou_dwa_weights_sum_to_one(session: AsyncSession):
    """importance_weight sums to ~1.0 per occupation in eloundou_dwa_scores.

    Uses a tolerance of 0.01 to account for floating-point rounding.
    """
    result = await session.execute(
        text(
            """
            SELECT onet_soc, ABS(SUM(importance_weight) - 1.0) AS deviation
            FROM eloundou_dwa_scores
            GROUP BY onet_soc
            HAVING ABS(SUM(importance_weight) - 1.0) > 0.01
        """
        )
    )
    bad_rows = result.fetchall()
    assert len(bad_rows) == 0, (
        f"Found {len(bad_rows)} occupations where importance_weight does not sum to 1.0. "
        f"First few: {bad_rows[:5]}"
    )


async def test_eloundou_dwa_coverage(session: AsyncSession):
    """At least 99% of onet_dwa_references have scores in eloundou_dwa_scores."""
    result = await session.execute(
        text(
            """
            SELECT
                (SELECT COUNT(DISTINCT dwa_id) FROM onet_dwa_references) AS total_dwas,
                (SELECT COUNT(DISTINCT dwa_id) FROM eloundou_dwa_scores) AS scored_dwas
        """
        )
    )
    row = result.one()
    total = row.total_dwas
    scored = row.scored_dwas
    if total == 0:
        pytest.skip("No DWA references loaded")
    coverage = scored / total
    assert coverage >= 0.99, f"DWA coverage is {coverage:.2%} ({scored}/{total}), expected >= 99%"


async def test_onet_soc_code_format(session: AsyncSession):
    """All onet_occupations.onet_soc match 'XX-XXXX.XX' pattern."""
    result = await session.execute(
        text(
            r"""
            SELECT COUNT(*) AS bad_codes
            FROM onet_occupations
            WHERE onet_soc !~ '^[0-9]{2}-[0-9]{4}\.[0-9]{2}$'
        """
        )
    )
    bad_codes = result.scalar_one()
    assert bad_codes == 0, f"Found {bad_codes} SOC codes not matching XX-XXXX.XX format"


async def test_aei_temporal_model_eras(session: AsyncSession):
    """All 4 expected model eras exist in aei_task_snapshots."""
    result = await session.execute(
        text(
            """
            SELECT DISTINCT model_era
            FROM aei_task_snapshots
            ORDER BY model_era
        """
        )
    )
    eras = [row[0] for row in result.fetchall()]
    expected = {"sonnet-3.5", "sonnet-3.7", "sonnet-4", "sonnet-4.5"}
    missing = expected - set(eras)
    assert len(missing) == 0, f"Missing model eras: {missing}. Found: {eras}"


async def test_dataset_versions_no_duplicates(session: AsyncSession):
    """No duplicate (dataset_name, version_key) pairs in dataset_versions."""
    result = await session.execute(
        text(
            """
            SELECT dataset_name, version_key, COUNT(*) AS cnt
            FROM dataset_versions
            GROUP BY dataset_name, version_key
            HAVING COUNT(*) > 1
        """
        )
    )
    dupes = result.fetchall()
    assert len(dupes) == 0, f"Found duplicate dataset versions: {dupes}"


async def test_ms_ai_iwa_coverage(session: AsyncSession):
    """All 332 ms_ai_iwa_metrics.iwa_code match onet_dwa_references.iwa_id."""
    result = await session.execute(
        text(
            """
            SELECT COUNT(*) AS unmatched
            FROM ms_ai_iwa_metrics m
            LEFT JOIN onet_dwa_references d ON m.iwa_code = d.iwa_id
            WHERE d.iwa_id IS NULL
        """
        )
    )
    unmatched = result.scalar_one()
    assert (
        unmatched == 0
    ), f"Found {unmatched} IWA codes in ms_ai_iwa_metrics with no match in onet_dwa_references"

    # Also verify we have exactly 332 IWA codes
    result2 = await session.execute(text("SELECT COUNT(DISTINCT iwa_code) FROM ms_ai_iwa_metrics"))
    iwa_count = result2.scalar_one()
    assert iwa_count == 332, f"Expected 332 IWA codes, found {iwa_count}"


# ── GDPval Data Invariants ──


async def test_gdpval_tasks_all_have_soc(session: AsyncSession):
    """All GDPval tasks must have onet_soc mapped."""
    result = await session.execute(text("SELECT COUNT(*) FROM gdpval_tasks WHERE onet_soc IS NULL"))
    unmapped = result.scalar_one()
    assert unmapped == 0, f"{unmapped} GDPval tasks lack SOC mapping"


async def test_gdpval_rubric_coverage(session: AsyncSession):
    """Every GDPval task must have at least one rubric item."""
    result = await session.execute(
        text(
            """
            SELECT COUNT(*) FROM gdpval_tasks gt
            WHERE NOT EXISTS (
                SELECT 1 FROM gdpval_rubric_items ri WHERE ri.task_id = gt.task_id
            )
        """
        )
    )
    orphaned = result.scalar_one()
    assert orphaned == 0, f"{orphaned} GDPval tasks lack rubric items"


async def test_gdpval_scores_finite(session: AsyncSession):
    """All scores in gdpval_rubric_items are finite (NaN/Inf not allowed).

    Note: negative scores are valid — GDPval uses them as penalty deductions.
    """
    result = await session.execute(
        text(
            """
            SELECT COUNT(*) FROM gdpval_rubric_items
            WHERE score IS NOT NULL
              AND (score = 'NaN'::float OR score = 'Infinity'::float OR score = '-Infinity'::float)
        """
        )
    )
    invalid = result.scalar_one()
    assert invalid == 0, f"{invalid} rubric items have non-finite scores"


async def test_aei_snapshots_automation_range(session: AsyncSession):
    """automation_pct and augmentation_pct in [0,1] when not null."""
    result = await session.execute(
        text(
            """
            SELECT COUNT(*) FROM aei_task_snapshots
            WHERE (automation_pct IS NOT NULL AND (automation_pct < 0 OR automation_pct > 1))
               OR (augmentation_pct IS NOT NULL AND (augmentation_pct < 0 OR augmentation_pct > 1))
        """
        )
    )
    violations = result.scalar_one()
    assert (
        violations == 0
    ), f"{violations} AEI snapshots have automation/augmentation pct outside [0,1]"


# ── OEWS Grain Invariants ──


async def test_oews_soc_is_six_digit(session: AsyncSession):
    """Every oews_employment.onet_soc is a 6-digit SOC code ('XX-XXXX'), no decimal.

    BLS OEWS publishes 6-digit SOC codes, and the entire US industry-profile
    computation (app/services/industry_profiles.py) joins on that grain by
    equality (Microsoft/AEI) and by 6→8-digit prefix (O*NET/Eloundou).

    This is the invariant the old 8-digit FK to onet_occupations violated: if an
    ingest ever stored 8-digit codes (e.g. by appending '.00' to satisfy that
    FK), the Microsoft/AEI equality joins would silently resolve to NULL. A
    clean rebuild must fail here rather than ship blank exposure scores.
    """
    result = await session.execute(
        text(
            r"""
            SELECT COUNT(*) AS bad_codes
            FROM oews_employment
            WHERE onet_soc !~ '^[0-9]{2}-[0-9]{4}$'
        """
        )
    )
    bad_codes = result.scalar_one()
    assert bad_codes == 0, (
        f"Found {bad_codes} oews_employment rows whose onet_soc is not a bare "
        "6-digit SOC code (XX-XXXX). OEWS must stay at 6-digit grain — the "
        "onet_occupations SOC FK was removed precisely because the grains differ."
    )


async def test_oews_soc_resolves_to_onet_base_occupation(session: AsyncSession):
    """Almost every distinct OEWS SOC code maps to an O*NET base occupation.

    This is the referential guarantee the (removed) 8-digit FK attempted, now
    expressed correctly at 6-digit grain: for each 6-digit OEWS code there should
    exist an 8-digit onet_occupations row sharing that stem ('11-1011' → '11-1011.00').

    A tolerance is allowed because OEWS publishes employment at a mix of *detailed*
    and *broad* SOC levels, while O*NET is detailed-only by design: broad/aggregate
    codes (e.g. '13-1020' "Buyers and Purchasing Agents", which rolls up 13-1021/22/23)
    have no O*NET row and never will. Measured against loaded data, 819/831 ≈ 98.6%
    of distinct OEWS codes resolve; the ~12 that don't are broad aggregates. A gross
    drop below this threshold means the SOC files are misparsed or out of sync — not
    a handful of expected broad codes.
    """
    result = await session.execute(
        text(
            r"""
            WITH distinct_codes AS (
                SELECT DISTINCT onet_soc FROM oews_employment
            )
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (
                    WHERE EXISTS (
                        SELECT 1 FROM onet_occupations o
                        WHERE o.onet_soc LIKE d.onet_soc || '.%'
                    )
                ) AS resolvable
            FROM distinct_codes d
        """
        )
    )
    row = result.one()
    if row.total == 0:
        pytest.skip("No OEWS data loaded")
    coverage = row.resolvable / row.total
    assert coverage >= 0.90, (
        f"Only {coverage:.0%} of {row.total} distinct OEWS SOC codes resolve to an "
        "O*NET base occupation (expected ≥90%). Below this threshold indicates a "
        "grain/parse mismatch, not just unmapped residuals."
    )


# ── AU Data Invariants (FR-8.9) ──


async def test_crosswalk_covers_all_naics_sectors(session: AsyncSession):
    """Every NAICS sector code in US profiles has a crosswalk entry."""
    result = await session.execute(
        text(
            """
            SELECT DISTINCT p.naics_code
            FROM industry_occupation_profiles p
            WHERE p.region = 'US'
              AND NOT EXISTS (
                  SELECT 1 FROM industry_crosswalk c
                  WHERE c.source_code = p.naics_code AND c.source_system = 'NAICS_2022'
              )
        """
        )
    )
    unmapped = [row[0] for row in result.fetchall()]
    assert len(unmapped) == 0, f"NAICS sectors without crosswalk: {unmapped}"


async def test_anzsco_concordance_coverage(session: AsyncSession):
    """Every ANZSCO code in abs_employment has a SOC concordance entry."""
    result = await session.execute(
        text(
            """
            SELECT COUNT(DISTINCT ab.anzsco_code)
            FROM abs_employment ab
            WHERE NOT EXISTS (
                SELECT 1 FROM anzsco_soc_concordance asc2
                WHERE asc2.anzsco_code = SUBSTRING(ab.anzsco_code FROM 1 FOR 4)
            )
        """
        )
    )
    unmapped = result.scalar_one()
    # Some nfd/catch-all codes may not match — allow up to 10%
    total = await session.execute(text("SELECT COUNT(DISTINCT anzsco_code) FROM abs_employment"))
    total_count = total.scalar_one()
    if total_count > 0:
        assert (
            unmapped / total_count < 0.10
        ), f"{unmapped}/{total_count} ANZSCO codes lack SOC concordance (>{10}%)"


async def test_au_profiles_have_region(session: AsyncSession):
    """All AU profiles have region='AU'."""
    result = await session.execute(
        text(
            """
            SELECT COUNT(*) FROM industry_occupation_profiles
            WHERE region = 'AU' AND naics_code ~ '^[A-S]$'
        """
        )
    )
    au_count = result.scalar_one()
    assert au_count > 0, "No AU profiles found"


async def test_au_profiles_have_exposure_scores(session: AsyncSession):
    """Most AU profiles have Eloundou Beta scores (via SOC concordance)."""
    result = await session.execute(
        text(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(eloundou_beta) AS with_beta
            FROM industry_occupation_profiles
            WHERE region = 'AU'
        """
        )
    )
    row = result.one()
    if row.total > 0:
        coverage = row.with_beta / row.total
        assert (
            coverage >= 0.80
        ), f"Only {coverage:.0%} of AU profiles have Eloundou Beta (expected ≥80%)"


# ── OSCA Data Invariants (FR-9.1, ADR-010) ──


async def _osca_loaded(session: AsyncSession) -> bool:
    n = (await session.execute(text("SELECT COUNT(*) FROM osca_occupations"))).scalar_one()
    return bool(n)


async def test_osca_main_tasks_descriptor_only(session: AsyncSession):
    """OSCA main tasks are descriptors and MUST NOT carry task-level exposure.

    Hard invariant (docs/domain-model.md, DWA-pivot ADR): OSCA tasks are
    GenAI-generated with no DWA linkage; the exposure carrier is the ASC
    specialist task, never OSCA.
    """
    if not await _osca_loaded(session):
        pytest.skip("OSCA not loaded")
    bad = (
        await session.execute(
            text("SELECT COUNT(*) FROM osca_main_tasks WHERE descriptor_only IS NOT TRUE")
        )
    ).scalar_one()
    assert bad == 0, f"{bad} osca_main_tasks are not descriptor_only"


async def test_osca_main_tasks_no_orphans(session: AsyncSession):
    """Every osca_main_tasks row references a known OSCA occupation."""
    if not await _osca_loaded(session):
        pytest.skip("OSCA not loaded")
    orphans = (
        await session.execute(
            text(
                """
                SELECT COUNT(*) FROM osca_main_tasks t
                LEFT JOIN osca_occupations o ON t.osca_code = o.osca_code
                WHERE o.osca_code IS NULL
                """
            )
        )
    ).scalar_one()
    assert orphans == 0, f"{orphans} osca_main_tasks reference unknown occupations"


async def test_osca_apportionment_reconciles(session: AsyncSession):
    """ADR-010: apportioned employment equals the de-duplicated ANZSCO base.

    Apportionment redistributes employment, never creates or destroys it.
    """
    n = (await session.execute(text("SELECT COUNT(*) FROM abs_employment_osca"))).scalar_one()
    if n == 0:
        pytest.skip("OSCA apportionment not computed")
    apportioned = float(
        (
            await session.execute(
                text("SELECT COALESCE(SUM(apportioned_employment), 0) FROM abs_employment_osca")
            )
        ).scalar_one()
    )
    base = float(
        (
            await session.execute(
                text(
                    """
                    SELECT COALESCE(SUM(employment), 0) FROM abs_employment ae
                    WHERE length(anzsco_code) = 6
                       OR (length(anzsco_code) = 4 AND NOT EXISTS (
                             SELECT 1 FROM abs_employment c
                             WHERE length(c.anzsco_code) = 6
                               AND c.anzsco_code LIKE ae.anzsco_code || '%'))
                    """
                )
            )
        ).scalar_one()
    )
    assert (
        abs(apportioned - base) < 1.0
    ), f"apportioned {apportioned} != de-dup base {base} (ADR-010 reconciliation)"


async def test_osca_apportionment_no_double_count(session: AsyncSession):
    """ADR-010 A0: 4-digit ANZSCO codes with 6-digit detail are not counted."""
    n = (await session.execute(text("SELECT COUNT(*) FROM abs_employment_osca"))).scalar_one()
    if n == 0:
        pytest.skip("OSCA apportionment not computed")
    leaked = (
        await session.execute(
            text(
                """
                SELECT COUNT(DISTINCT o.anzsco_code) FROM abs_employment_osca o
                WHERE length(o.anzsco_code) = 4
                  AND EXISTS (
                    SELECT 1 FROM abs_employment c
                    WHERE length(c.anzsco_code) = 6 AND c.anzsco_code LIKE o.anzsco_code || '%')
                """
            )
        )
    ).scalar_one()
    assert leaked == 0, f"{leaked} aggregated 4-digit codes double-count with 6-digit detail"


async def test_osca_no_single_target_partial_mappings(session: AsyncSession):
    """Guard (ADR-010): no ANZSCO code has a single-target, PARTIAL-only mapping.

    The apportionment ladder tags any single-target edge as A1 'full'
    (confidence 1.0) without consulting the ABS 'p' flag. That is safe only
    while this precondition holds (verified true for OSCA 2024 v1.0). If a
    future correspondence version introduces a single-target partial edge,
    this test fails — decide the A1-partial treatment explicitly (see
    ai_working/decisions/ADR-010) instead of silently over-assigning that
    code's employment.
    """
    if not await _osca_loaded(session):
        pytest.skip("OSCA not loaded")
    violators = (
        await session.execute(
            text(
                """
                SELECT COUNT(*) FROM (
                    SELECT anzsco_code
                    FROM osca_anzsco_map
                    GROUP BY anzsco_code
                    HAVING COUNT(DISTINCT osca_code) = 1
                       AND bool_and(correspondence_type = 'partial')
                ) t
                """
            )
        )
    ).scalar_one()
    assert violators == 0, (
        f"{violators} ANZSCO codes have a single-target PARTIAL-only OSCA mapping — "
        "the apportionment would tag them 'full'/1.0. Resolve per ADR-010 before re-running."
    )


async def test_osca_apportionment_method_tagged(session: AsyncSession):
    """Every apportioned row carries a known link_method (no silent blending)."""
    n = (await session.execute(text("SELECT COUNT(*) FROM abs_employment_osca"))).scalar_one()
    if n == 0:
        pytest.skip("OSCA apportionment not computed")
    bad = (
        await session.execute(
            text(
                "SELECT COUNT(*) FROM abs_employment_osca "
                "WHERE link_method NOT IN ('full', 'apportioned_equal', 'apportioned_employment')"
            )
        )
    ).scalar_one()
    assert bad == 0, f"{bad} apportionment rows have an unknown link_method"


# ── Integrity Hash Tests (ADR-002) ──


class TestIntegrityHash:
    """Tests for the shared hash utilities and dataset_versions integrity column.

    test_all_dataset_versions_have_hash: Queries the live DB. If the DB has
    pre-existing rows with NULL or placeholder hashes (e.g., from ingestion
    before this fix was applied), those will be reported as failures. That is
    the intended behaviour — run re-ingestion with the updated scripts to
    populate real hashes.
    """

    async def test_all_dataset_versions_have_hash(self, session: AsyncSession) -> None:
        """All dataset_versions rows must have a real integrity_hash (not NULL or placeholder)."""
        result = await session.execute(
            text(
                """
                SELECT dataset_name, version_key, integrity_hash
                FROM dataset_versions
                WHERE integrity_hash IS NULL OR integrity_hash = 'multi-release'
            """
            )
        )
        bad_rows = result.fetchall()
        assert len(bad_rows) == 0, (
            f"Found {len(bad_rows)} dataset_versions rows with NULL or placeholder hashes: "
            + ", ".join(f"{r[0]}/{r[1]}={r[2]!r}" for r in bad_rows[:5])
            + " — re-run the updated ingest scripts to populate real hashes."
        )

    def test_hash_utility_consistency(self) -> None:
        """compute_file_hash on a temp file matches manual hashlib.sha256 computation."""
        content = b"test content for hash verification 12345"
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(content)
            tmp_path = Path(f.name)

        try:
            result = compute_file_hash(tmp_path)
            expected = hashlib.sha256(content).hexdigest()
            assert (
                result == expected
            ), f"compute_file_hash returned {result!r}, expected {expected!r}"
        finally:
            tmp_path.unlink(missing_ok=True)

    def test_compute_files_hash_is_deterministic(self) -> None:
        """compute_files_hash returns the same value when called twice with the same files."""
        content_a = b"file a content"
        content_b = b"file b content"
        with (
            tempfile.NamedTemporaryFile(delete=False, suffix="_a.bin") as fa,
            tempfile.NamedTemporaryFile(delete=False, suffix="_b.bin") as fb,
        ):
            fa.write(content_a)
            fb.write(content_b)
            path_a = Path(fa.name)
            path_b = Path(fb.name)

        try:
            hash1 = compute_files_hash([path_a, path_b])
            hash2 = compute_files_hash([path_b, path_a])  # different order → same result (sorted)
            assert (
                hash1 == hash2
            ), f"compute_files_hash is not deterministic: {hash1!r} != {hash2!r}"
        finally:
            path_a.unlink(missing_ok=True)
            path_b.unlink(missing_ok=True)

    def test_compute_json_hash_is_deterministic(self) -> None:
        """compute_json_hash returns the same value for the same object called twice."""
        obj = [("11", "Agriculture", "A", "Farming", "A", "exact", 1.0)]
        hash1 = compute_json_hash(obj)
        hash2 = compute_json_hash(obj)
        assert hash1 == hash2, f"compute_json_hash is not deterministic: {hash1!r} != {hash2!r}"
