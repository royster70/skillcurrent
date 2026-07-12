"""FR-9.2 Phase B2 — DWA<->ASC semantic bridge integrity (ADR-011 L2).

Verifies the bridge is populated, confidence is bounded by the floor, coverage
is high, and every matched DWA is a real O*NET DWA. Skips when not built.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def _count(session: AsyncSession, sql: str) -> int:
    return int((await session.execute(text(sql))).scalar_one())


async def _require_bridge(session: AsyncSession) -> None:
    if await _count(session, "SELECT COUNT(*) FROM dwa_asc_bridge") == 0:
        pytest.skip("DWA-ASC bridge not built — run scripts.build_dwa_asc_bridge")


async def test_bridge_confidence_bounds(session: AsyncSession):
    """ADR-011: every match has cosine/confidence in [0.60, 1.0], method=semantic."""
    await _require_bridge(session)
    bad = await _count(
        session,
        "SELECT COUNT(*) FROM dwa_asc_bridge "
        "WHERE cosine_similarity < 0.60 OR cosine_similarity > 1.0001 "
        "OR confidence <> cosine_similarity OR method <> 'semantic'",
    )
    assert bad == 0, f"{bad} bridge rows violate the confidence/method contract"


async def test_bridge_dwa_ids_valid(session: AsyncSession):
    """Every bridged dwa_id is a real O*NET DWA."""
    await _require_bridge(session)
    orphans = await _count(
        session,
        """
        SELECT COUNT(*) FROM dwa_asc_bridge b
        WHERE NOT EXISTS (SELECT 1 FROM onet_dwa_references d WHERE d.dwa_id = b.dwa_id)
        """,
    )
    assert orphans == 0, f"{orphans} bridge rows reference unknown DWAs"


async def test_bridge_task_coverage(session: AsyncSession):
    """The bridge covers the large majority of distinct ASC specialist tasks.

    Semantic matching is high-fidelity here (ASC tasks are reworded DWAs), so
    coverage should be very high; guard at >=90% to catch a regression.
    """
    await _require_bridge(session)
    matched = await _count(session, "SELECT COUNT(DISTINCT specialist_task) FROM dwa_asc_bridge")
    total = await _count(session, "SELECT COUNT(DISTINCT specialist_task) FROM asc_specialist_task")
    assert (
        total == 0 or matched / total >= 0.90
    ), f"bridge covers only {matched}/{total} ASC tasks (<90%)"


async def test_bridge_embeddings_present(session: AsyncSession):
    """Both embedding tables are populated (bridge inputs)."""
    await _require_bridge(session)
    assert (
        await _count(session, "SELECT COUNT(*) FROM dwa_embeddings WHERE embedding IS NOT NULL") > 0
    )
    assert (
        await _count(
            session, "SELECT COUNT(*) FROM asc_task_embeddings WHERE embedding IS NOT NULL"
        )
        > 0
    )
