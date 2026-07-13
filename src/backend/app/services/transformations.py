"""Transformation tracking decorator (ADR-001).

Wraps transformation service functions to automatically log execution
in the transformation_log table with source/target mapping, row counts,
status, and version provenance.
"""

import functools
import traceback
from collections.abc import Callable
from datetime import datetime
from typing import Any

from sqlalchemy import insert, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.correlation import pipeline_run_id_var
from app.models.infrastructure import TransformationLog


def tracked_transformation(
    name: str,
    sources: list[str],
    target: str,
) -> Callable[..., Any]:
    """Decorator that logs transformation runs to transformation_log.

    The decorated function must:
    - Accept `session: AsyncSession` as its first argument
    - Return an int (rows_affected)

    Additional keyword arguments are captured in the `parameters` JSONB column,
    providing version provenance (e.g., onet_version_id, aei_version_id).

    Usage::

        @tracked_transformation(
            name="compute_industry_profiles",
            sources=["oews_employment", "aei_task_snapshots"],
            target="industry_occupation_profiles",
        )
        async def compute_industry_profiles(
            session: AsyncSession, release_year: int
        ) -> int:
            # ... transformation logic ...
            return rows_affected
    """

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        async def wrapper(session: AsyncSession, *args: Any, **kwargs: Any) -> int:
            # Insert log entry at start. Tag the batch correlation key so a
            # full rebuild's derived stages are traceable as one unit (ADR-007
            # Phase 3, Rule 2). Empty string → NULL (ad-hoc CLI run).
            pipeline_run_id = pipeline_run_id_var.get("") or None
            result = await session.execute(
                insert(TransformationLog)
                .values(
                    name=name,
                    source_tables=sources,
                    target_table=target,
                    started_at=datetime.utcnow(),
                    status="running",
                    parameters=kwargs if kwargs else None,
                    pipeline_run_id=pipeline_run_id,
                )
                .returning(TransformationLog.id)
            )
            log_id = result.scalar_one()
            await session.flush()

            try:
                rows_affected = int(await func(session, *args, **kwargs))

                # Update on success
                await session.execute(
                    update(TransformationLog)
                    .where(TransformationLog.id == log_id)
                    .values(
                        completed_at=datetime.utcnow(),
                        rows_affected=rows_affected,
                        status="success",
                    )
                )
                return rows_affected

            except Exception as exc:
                # Update on failure
                await session.execute(
                    update(TransformationLog)
                    .where(TransformationLog.id == log_id)
                    .values(
                        completed_at=datetime.utcnow(),
                        status="failed",
                        error_message=f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
                    )
                )
                raise

        return wrapper

    return decorator
