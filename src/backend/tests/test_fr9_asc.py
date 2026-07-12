"""FR-9.2 Phase B1 — ASC v3.0 ingest integrity + DWA-pivot preconditions.

Verifies the three ASC layers load, that every ASC occupation reaches OSCA
(the pivot's first hop), and the ADR-011 B0 finding (no DWA lineage in v3.0).
Skips cleanly when ASC is not loaded.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def _count(session: AsyncSession, sql: str) -> int:
    return int((await session.execute(text(sql))).scalar_one())


async def _require_asc(session: AsyncSession) -> None:
    if await _count(session, "SELECT COUNT(*) FROM asc_specialist_task") == 0:
        pytest.skip("ASC not loaded — run scripts.ingest_asc")


async def test_asc_layers_loaded(session: AsyncSession):
    """All three ASC layers have data."""
    await _require_asc(session)
    assert await _count(session, "SELECT COUNT(*) FROM asc_specialist_task") > 10000
    assert await _count(session, "SELECT COUNT(*) FROM asc_core_competency") > 0
    assert await _count(session, "SELECT COUNT(*) FROM asc_technology_tool") > 0


async def test_asc_specialist_tasks_have_text(session: AsyncSession):
    """Every specialist task carries text to embed for the L2 semantic bridge."""
    await _require_asc(session)
    empty = await _count(
        session,
        "SELECT COUNT(*) FROM asc_specialist_task "
        "WHERE specialist_task IS NULL OR specialist_task = ''",
    )
    assert empty == 0, f"{empty} ASC specialist tasks have no text"


async def test_asc_no_dwa_lineage_in_v3(session: AsyncSession):
    """ADR-011 / B0: ASC v3.0 exposes no source-DWA — bridge must be semantic.

    If a future ASC version populates source_dwa_id, this test flags that the
    L1 dwa_lookup rung has become available and the bridge logic can be revisited.
    """
    await _require_asc(session)
    with_dwa = await _count(
        session,
        "SELECT COUNT(*) FROM asc_specialist_task "
        "WHERE source_dwa_id IS NOT NULL AND asc_version = '3.0'",
    )
    assert with_dwa == 0, (
        f"{with_dwa} ASC v3.0 tasks have source_dwa_id — B0 assumed none; "
        "the L1 dwa_lookup rung (ADR-011) may now be viable, revisit dwa_asc_bridge"
    )


async def test_asc_occupations_reach_osca(session: AsyncSession):
    """Every ASC ANZSCO code reaches an OSCA occupation (the pivot's first hop).

    ASC keys on 4- and 6-digit ANZSCO; OSCA correspondence is 6-digit, so a
    4-digit ASC code reaches OSCA via its 6-digit children (prefix), reusing
    the ADR-010 expansion.
    """
    await _require_asc(session)
    # skip if OSCA correspondence not present
    if await _count(session, "SELECT COUNT(*) FROM osca_anzsco_map") == 0:
        pytest.skip("OSCA correspondence not loaded")
    unreachable = await _count(
        session,
        """
        SELECT COUNT(DISTINCT a.anzsco_code)
        FROM asc_specialist_task a
        WHERE NOT EXISTS (
                SELECT 1 FROM osca_anzsco_map m WHERE m.anzsco_code = a.anzsco_code)
          AND NOT EXISTS (
                SELECT 1 FROM osca_anzsco_map m WHERE m.anzsco_code LIKE a.anzsco_code || '%')
        """,
    )
    assert unreachable == 0, f"{unreachable} ASC ANZSCO codes cannot reach any OSCA occupation"
