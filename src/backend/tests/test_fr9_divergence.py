"""FR-9.2 — US-vs-AU occupation exposure divergence.

Verifies the divergence is computed on a comparable basis and stays consistent
with its components. Skips when not computed.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def _count(session: AsyncSession, sql: str) -> int:
    return int((await session.execute(text(sql))).scalar_one())


async def _require(session: AsyncSession) -> None:
    n = await _count(
        session, "SELECT COUNT(*) FROM au_occupation_exposure WHERE divergence IS NOT NULL"
    )
    if n == 0:
        pytest.skip("divergence not computed — run scripts.compute_us_au_divergence")


async def test_divergence_equals_us_minus_au(session: AsyncSession):
    """divergence = us_task_beta - au_task_beta (consistency with components)."""
    await _require(session)
    bad = await _count(
        session,
        """
        SELECT COUNT(*) FROM au_occupation_exposure
        WHERE divergence IS NOT NULL
          AND abs(divergence - (us_task_beta - au_task_beta)) > 1e-6
        """,
    )
    assert bad == 0, f"{bad} rows where divergence != us_task_beta - au_task_beta"


async def test_divergence_requires_both_sides(session: AsyncSession):
    """A divergence only exists where both us and au betas are present."""
    await _require(session)
    bad = await _count(
        session,
        "SELECT COUNT(*) FROM au_occupation_exposure "
        "WHERE divergence IS NOT NULL AND (us_task_beta IS NULL OR au_task_beta IS NULL)",
    )
    assert bad == 0, f"{bad} divergence rows missing a us or au beta"


async def test_divergence_coverage(session: AsyncSession):
    """Most AU-task occupations have a US comparison (>=80% reach a US SOC)."""
    await _require(session)
    total = await _count(
        session, "SELECT COUNT(*) FROM au_occupation_exposure WHERE au_task_beta IS NOT NULL"
    )
    withd = await _count(
        session, "SELECT COUNT(*) FROM au_occupation_exposure WHERE divergence IS NOT NULL"
    )
    assert (
        total == 0 or withd / total >= 0.80
    ), f"only {withd}/{total} AU occupations have a US divergence (<80%)"
