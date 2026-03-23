"""Tests for the @tracked_transformation decorator (ADR-001).

Verifies that the decorator correctly logs transformation runs
to the transformation_log table with status, row counts, and parameters.
"""

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import TransformationLog
from app.services.transformations import tracked_transformation


@tracked_transformation(
    name="test_transform_success",
    sources=["source_a", "source_b"],
    target="target_table",
)
async def _dummy_transform_success(session: AsyncSession, **kwargs) -> int:
    """A dummy transformation that succeeds and returns a row count."""
    return 42


@tracked_transformation(
    name="test_transform_failure",
    sources=["source_x"],
    target="target_y",
)
async def _dummy_transform_failure(session: AsyncSession, **kwargs) -> int:
    """A dummy transformation that raises an exception."""
    raise ValueError("Something went wrong in the transformation")


@tracked_transformation(
    name="test_transform_params",
    sources=["src_1"],
    target="tgt_1",
)
async def _dummy_transform_with_params(session: AsyncSession, **kwargs) -> int:
    """A dummy transformation that accepts keyword arguments."""
    return 7


async def test_tracked_transformation_success(session: AsyncSession):
    """Decorator logs start, captures row count, marks success."""
    result = await _dummy_transform_success(session)
    assert result == 42

    # Query the transformation_log to verify
    row = (
        await session.execute(
            select(TransformationLog).where(
                TransformationLog.name == "test_transform_success"
            )
        )
    ).scalar_one()

    assert row.status == "success"
    assert row.rows_affected == 42
    assert row.source_tables == ["source_a", "source_b"]
    assert row.target_table == "target_table"
    assert row.started_at is not None
    assert row.completed_at is not None
    assert row.error_message is None


async def test_tracked_transformation_failure(session: AsyncSession):
    """Decorator catches exception, marks failed with error message."""
    with pytest.raises(ValueError, match="Something went wrong"):
        await _dummy_transform_failure(session)

    # Query the transformation_log — should show failure
    row = (
        await session.execute(
            select(TransformationLog).where(
                TransformationLog.name == "test_transform_failure"
            )
        )
    ).scalar_one()

    assert row.status == "failed"
    assert row.rows_affected is None
    assert "ValueError" in row.error_message
    assert "Something went wrong" in row.error_message
    assert row.completed_at is not None


async def test_tracked_transformation_captures_parameters(session: AsyncSession):
    """kwargs are stored in the parameters JSONB column."""
    result = await _dummy_transform_with_params(
        session, onet_version="28.1", release_year=2024
    )
    assert result == 7

    row = (
        await session.execute(
            select(TransformationLog).where(
                TransformationLog.name == "test_transform_params"
            )
        )
    ).scalar_one()

    assert row.status == "success"
    assert row.parameters is not None
    assert row.parameters["onet_version"] == "28.1"
    assert row.parameters["release_year"] == 2024
