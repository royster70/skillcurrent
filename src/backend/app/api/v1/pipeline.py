"""Pipeline status and control endpoints (FR-8.8)."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(prefix="/admin/pipeline", tags=["admin", "pipeline"])


@router.get("/status")
async def pipeline_status(db: AsyncSession = Depends(get_db)):
    """Return pipeline health: last run per stage from transformation_log."""
    result = await db.execute(
        text(
            """
        SELECT
            name,
            status,
            rows_affected,
            started_at,
            completed_at,
            EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 AS duration_ms,
            error_message
        FROM transformation_log
        WHERE (name, started_at) IN (
            SELECT name, MAX(started_at)
            FROM transformation_log
            GROUP BY name
        )
        ORDER BY started_at DESC
        LIMIT 50
    """
        )
    )
    rows = result.mappings().all()
    stages = [dict(r) for r in rows]

    overall = "healthy"
    if any(s["status"] == "failed" for s in stages):
        overall = "degraded"
    elif not stages:
        overall = "no_runs"

    return {
        "overall_status": overall,
        "stage_count": len(stages),
        "stages": stages,
        "checked_at": datetime.now(UTC).isoformat(),
    }


@router.get("/dag")
async def pipeline_dag():
    """Return the pipeline dependency DAG.

    Derived from the single source of truth
    (``scripts.run_pipeline._build_pipeline_dag``) so the documented graph can
    never drift from what the orchestrator actually runs.
    """
    from scripts.run_pipeline import _build_pipeline_dag

    return {
        "stages": [
            {
                "name": s.name,
                "depends_on": s.depends_on,
                "optional": s.optional,
                "description": s.description,
            }
            for s in _build_pipeline_dag()
        ]
    }
