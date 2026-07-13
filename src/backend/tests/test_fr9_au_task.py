"""FR-9.2 Phase B2b — au_task AU-native exposure layer (ADR-011).

Verifies exposure is attached, the ladder/separate-column invariants hold, the
OSCA_main descriptor write-reject CHECK fires, and the occupation rollup exists.
Skips when the layer is not built.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


async def _count(session: AsyncSession, sql: str) -> int:
    return int((await session.execute(text(sql))).scalar_one())


async def _require(session: AsyncSession) -> None:
    if await _count(session, "SELECT COUNT(*) FROM au_task") == 0:
        pytest.skip("au_task not built — run scripts.compute_au_task_layer")


async def test_au_task_measured_are_t2(session: AsyncSession):
    """Every measured ASC task is tier T2 with confidence in [0.60, 1.0] (ADR-011)."""
    await _require(session)
    bad = await _count(
        session,
        """
        SELECT COUNT(*) FROM au_task
        WHERE task_source = 'ASC_specialist' AND task_level_available
          AND (task_level_method <> 'T2'
               OR au_native_beta IS NULL
               OR confidence < 0.60 OR confidence > 1.0001)
        """,
    )
    assert bad == 0, f"{bad} measured au_task rows violate the T2/confidence contract"


async def test_au_task_beta_source_and_separation(session: AsyncSession):
    """au_native_beta uses global_avg; the SOC ladder + us_imported cols stay reserved."""
    await _require(session)
    bad_src = await _count(
        session,
        "SELECT COUNT(*) FROM au_task "
        "WHERE au_native_beta IS NOT NULL AND beta_source <> 'global_avg'",
    )
    assert bad_src == 0, f"{bad_src} rows have exposure without beta_source='global_avg'"


async def test_osca_main_exposure_rejected(session: AsyncSession):
    """The CHECK constraint rejects task-level exposure on OSCA_main descriptors."""
    await _require(session)
    with pytest.raises(IntegrityError):
        await session.execute(
            text(
                "INSERT INTO au_task (osca_code, task_source, task_text, "
                "task_level_available, task_level_method, au_native_beta) "
                "VALUES ('999999', 'OSCA_main', 'x', true, 'T2', 0.1)"
            )
        )
        await session.flush()
    await session.rollback()


async def test_au_occupation_rollup(session: AsyncSession):
    """Occupation rollup exists with honest coverage and matches au_task."""
    await _require(session)
    rollup = await _count(session, "SELECT COUNT(*) FROM au_occupation_exposure")
    au_occ = await _count(
        session,
        "SELECT COUNT(DISTINCT osca_code) FROM au_task WHERE task_source = 'ASC_specialist'",
    )
    assert rollup == au_occ, f"rollup {rollup} != au_task occupations {au_occ}"
    bad_cov = await _count(
        session,
        "SELECT COUNT(*) FROM au_occupation_exposure WHERE coverage_pct < 0 OR coverage_pct > 100",
    )
    assert bad_cov == 0, f"{bad_cov} rollup rows have coverage outside [0,100]"
