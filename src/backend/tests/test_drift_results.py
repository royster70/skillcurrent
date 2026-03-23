"""Integration tests for drift calculation results against real data.

Validates that the computed task_drift_metrics are sane — proper values,
valid classifications, correct coverage.
"""

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_drift_metrics_populated(session):
    """FR-8.2: task_drift_metrics should have rows."""
    r = await session.execute(text("SELECT COUNT(*) FROM task_drift_metrics"))
    count = r.scalar()
    assert count > 0, "task_drift_metrics is empty"
    assert count >= 4000, f"Expected >= 4000 tasks, got {count}"


@pytest.mark.asyncio
async def test_all_velocities_finite(session):
    """All computed velocities should be finite numbers (not NaN/Inf)."""
    r = await session.execute(text("""
        SELECT COUNT(*) FROM task_drift_metrics
        WHERE velocity IS NOT NULL
          AND (velocity = 'NaN'::float OR velocity = 'Infinity'::float
               OR velocity = '-Infinity'::float)
    """))
    bad = r.scalar()
    assert bad == 0, f"{bad} rows have NaN/Inf velocity"


@pytest.mark.asyncio
async def test_valid_classifications_only(session):
    """Classifications must be from the allowed set or NULL."""
    r = await session.execute(text("""
        SELECT DISTINCT classification FROM task_drift_metrics
        WHERE classification IS NOT NULL
    """))
    valid = {"departing", "enduring", "emerging", "below_threshold"}
    actual = {row[0] for row in r.fetchall()}
    invalid = actual - valid
    assert not invalid, f"Invalid classifications found: {invalid}"


@pytest.mark.asyncio
async def test_departing_have_positive_velocity(session):
    """All departing tasks must have positive velocity."""
    r = await session.execute(text("""
        SELECT COUNT(*) FROM task_drift_metrics
        WHERE classification = 'departing' AND velocity <= 0
    """))
    bad = r.scalar()
    assert bad == 0, f"{bad} departing tasks have non-positive velocity"


@pytest.mark.asyncio
async def test_below_threshold_in_range(session):
    """Below-threshold tasks must have latest_task_pct in 0.40–0.50 range."""
    r = await session.execute(text("""
        SELECT COUNT(*) FROM task_drift_metrics
        WHERE classification = 'below_threshold'
          AND (latest_task_pct < 0.40 OR latest_task_pct > 0.50)
    """))
    bad = r.scalar()
    assert bad == 0, f"{bad} below_threshold tasks outside 40-50% range"


@pytest.mark.asyncio
async def test_single_snapshot_not_classified(session):
    """Tasks with only 1 snapshot should have NULL velocity and classification."""
    r = await session.execute(text("""
        SELECT COUNT(*) FROM task_drift_metrics
        WHERE snapshot_count = 1 AND velocity IS NOT NULL
    """))
    bad = r.scalar()
    assert bad == 0, f"{bad} single-snapshot tasks have velocity (should be NULL)"


@pytest.mark.asyncio
async def test_r_squared_in_range(session):
    """R² values should be between 0 and 1."""
    r = await session.execute(text("""
        SELECT COUNT(*) FROM task_drift_metrics
        WHERE r_squared IS NOT NULL AND (r_squared < 0 OR r_squared > 1.001)
    """))
    bad = r.scalar()
    assert bad == 0, f"{bad} rows have R² outside [0, 1]"


@pytest.mark.asyncio
async def test_transformation_log_recorded(session):
    """Drift computation should be recorded in transformation_log (ADR-001)."""
    r = await session.execute(text("""
        SELECT status, rows_affected FROM transformation_log
        WHERE name = 'compute_task_drift'
    """))
    row = r.fetchone()
    assert row is not None, "compute_task_drift not in transformation_log"
    assert row[0] == "success"
    assert row[1] > 0
