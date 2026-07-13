"""FR-9.1 / ADR-010 — ANZSCO->OSCA employment apportionment invariants.

Locks in the reconciliation guarantee (apportionment redistributes, never
creates/destroys employment), the double-count guard (A0), and method-tagging.
Skips cleanly when the apportionment has not been computed.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_BASE_SQL = """
    SELECT sum(employment) FROM abs_employment ae
    WHERE length(anzsco_code) = 6
       OR (length(anzsco_code) = 4 AND NOT EXISTS (
             SELECT 1 FROM abs_employment c
             WHERE length(c.anzsco_code) = 6
               AND c.anzsco_code LIKE ae.anzsco_code || '%'))
"""


async def _count(session: AsyncSession, sql: str) -> float:
    return float((await session.execute(text(sql))).scalar_one() or 0)


async def _require(session: AsyncSession) -> None:
    if await _count(session, "SELECT COUNT(*) FROM abs_employment_osca") == 0:
        pytest.skip("OSCA apportionment not computed — run scripts.compute_osca_employment")


async def test_reconciliation_totals(session: AsyncSession):
    """Apportioned employment equals the de-duplicated ANZSCO base (ADR-010)."""
    await _require(session)
    apportioned = await _count(
        session, "SELECT sum(apportioned_employment) FROM abs_employment_osca"
    )
    base = await _count(session, _BASE_SQL)
    assert (
        abs(apportioned - base) < 1.0
    ), f"apportioned {apportioned} != base {base} (diff {apportioned - base})"


async def test_per_source_reconciliation(session: AsyncSession):
    """Each source (anzsco x anzsic x area) sums back to its own employment."""
    await _require(session)
    mismatches = await _count(
        session,
        """
        SELECT COUNT(*) FROM (
            SELECT o.anzsco_code, o.anzsic_code, o.area_code,
                   sum(o.apportioned_employment) AS got, max(a.employment) AS src
            FROM abs_employment_osca o
            JOIN abs_employment a
              ON a.anzsco_code = o.anzsco_code AND a.anzsic_code = o.anzsic_code
             AND a.area_code = o.area_code
            GROUP BY o.anzsco_code, o.anzsic_code, o.area_code
            HAVING abs(sum(o.apportioned_employment) - max(a.employment)) > 0.5
        ) t
        """,
    )
    assert mismatches == 0, f"{mismatches} source rows do not reconcile to their employment"


async def test_no_double_count(session: AsyncSession):
    """A0: 4-digit codes that HAVE 6-digit detail must not appear as a source."""
    await _require(session)
    leaked = await _count(
        session,
        """
        SELECT COUNT(DISTINCT o.anzsco_code)
        FROM abs_employment_osca o
        WHERE length(o.anzsco_code) = 4
          AND EXISTS (
            SELECT 1 FROM abs_employment c
            WHERE length(c.anzsco_code) = 6 AND c.anzsco_code LIKE o.anzsco_code || '%')
        """,
    )
    assert leaked == 0, f"{leaked} aggregated 4-digit codes double-count with 6-digit detail"


async def test_method_tags_and_confidence(session: AsyncSession):
    """Every row is method-tagged; full links have confidence 1.0."""
    await _require(session)
    bad_method = await _count(
        session,
        "SELECT COUNT(*) FROM abs_employment_osca "
        "WHERE link_method NOT IN ('full', 'apportioned_equal', 'apportioned_employment')",
    )
    assert bad_method == 0, f"{bad_method} rows have an unknown link_method"
    bad_full = await _count(
        session,
        "SELECT COUNT(*) FROM abs_employment_osca WHERE link_method = 'full' AND confidence <> 1.0",
    )
    assert bad_full == 0, f"{bad_full} full-link rows lack confidence 1.0"


async def test_coverage_lifted(session: AsyncSession):
    """Employment coverage is ~100% of the de-dup base (was 18.6% direct-only)."""
    await _require(session)
    apportioned = await _count(
        session, "SELECT sum(apportioned_employment) FROM abs_employment_osca"
    )
    base = await _count(session, _BASE_SQL)
    assert base > 0 and apportioned / base >= 0.99, f"coverage {apportioned / base:.1%} below 99%"
