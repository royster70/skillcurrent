"""FR-9.1 Phase A — OSCA backbone integrity + non-breaking guarantees.

Verifies the OSCA 2024 ingest (osca_occupations / osca_main_tasks /
osca_anzsco_map / osca_isco_map), the dual-key linkage onto abs_employment,
and that adding OSCA did not disturb the existing AU data.

Tests skip cleanly when OSCA is not loaded (fresh DB), matching the repo's
data-invariant convention.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def _count(session: AsyncSession, sql: str) -> int:
    return int((await session.execute(text(sql))).scalar_one())


async def _require_osca(session: AsyncSession) -> None:
    if await _count(session, "SELECT COUNT(*) FROM osca_occupations") == 0:
        pytest.skip("OSCA not loaded — run scripts.ingest_osca")


async def test_osca_occupations_loaded(session: AsyncSession):
    """OSCA 2024 has ~1,150 six-digit occupations."""
    await _require_osca(session)
    n = await _count(session, "SELECT COUNT(*) FROM osca_occupations")
    assert n > 1000, f"expected >1000 OSCA occupations, got {n}"
    # every osca_code is a 6-digit code
    bad = await _count(
        session,
        "SELECT COUNT(*) FROM osca_occupations WHERE osca_code !~ '^[0-9]{6}$'",
    )
    assert bad == 0, f"{bad} osca_occupations rows have non-6-digit codes"


async def test_osca_main_tasks_reference_valid_occupations(session: AsyncSession):
    """No orphan main tasks — every task's osca_code exists in osca_occupations."""
    await _require_osca(session)
    orphans = await _count(
        session,
        """
        SELECT COUNT(*) FROM osca_main_tasks t
        LEFT JOIN osca_occupations o ON t.osca_code = o.osca_code
        WHERE o.osca_code IS NULL
        """,
    )
    assert orphans == 0, f"{orphans} osca_main_tasks reference unknown occupations"


async def test_osca_main_tasks_are_descriptor_only(session: AsyncSession):
    """Invariant: OSCA main tasks are descriptors, never exposure carriers."""
    await _require_osca(session)
    non_descriptor = await _count(
        session, "SELECT COUNT(*) FROM osca_main_tasks WHERE descriptor_only IS NOT TRUE"
    )
    assert non_descriptor == 0, f"{non_descriptor} osca_main_tasks not descriptor_only"


async def test_osca_anzsco_map_covers_six_digit_abs(session: AsyncSession):
    """The 6-digit ANZSCO codes in abs_employment are mostly covered by OSCA."""
    await _require_osca(session)
    matched = await _count(
        session,
        """
        SELECT COUNT(DISTINCT a.anzsco_code)
        FROM abs_employment a
        JOIN osca_anzsco_map m ON a.anzsco_code = m.anzsco_code
        WHERE length(a.anzsco_code) = 6
        """,
    )
    total6 = await _count(
        session,
        "SELECT COUNT(DISTINCT anzsco_code) FROM abs_employment WHERE length(anzsco_code) = 6",
    )
    assert (
        total6 == 0 or matched / total6 >= 0.8
    ), f"6-digit ANZSCO->OSCA coverage {matched}/{total6} below 80%"


async def test_abs_employment_dual_keyed_to_osca(session: AsyncSession):
    """Dual-key populated for unambiguous 6-digit matches; 4-digit rows stay NULL."""
    await _require_osca(session)
    linked = await _count(
        session, "SELECT COUNT(*) FROM abs_employment WHERE osca_code IS NOT NULL"
    )
    assert linked > 0, "no abs_employment rows linked to OSCA"
    # 4-digit unit-group rows must NOT be linked (they need apportionment)
    bad_4digit = await _count(
        session,
        "SELECT COUNT(*) FROM abs_employment WHERE length(anzsco_code) = 4 AND osca_code IS NOT NULL",
    )
    assert bad_4digit == 0, f"{bad_4digit} 4-digit ANZSCO rows wrongly linked to OSCA"


async def test_osca_backbone_non_breaking(session: AsyncSession):
    """Adding OSCA did not disturb existing AU data (regression guard)."""
    # These hold whether or not OSCA is loaded — the columns are additive.
    assert await _count(session, "SELECT COUNT(*) FROM abs_employment") > 0
    assert (
        await _count(
            session,
            "SELECT COUNT(*) FROM industry_occupation_profiles WHERE region = 'AU'",
        )
        > 0
    )
    # osca_code columns exist on both dual-keyed tables
    for table in ("abs_employment", "industry_occupation_profiles"):
        has_col = await _count(
            session,
            f"""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = '{table}' AND column_name = 'osca_code'
            """,
        )
        assert has_col == 1, f"{table}.osca_code column missing"
