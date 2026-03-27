"""Admin endpoints — health check and operational metrics (ADR-007)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/health")
async def health() -> dict:
    """Basic health check."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/metrics")
async def metrics(db: AsyncSession = Depends(get_db)) -> dict:
    """Recent request performance metrics from api_request_log.

    Returns aggregate stats for the last 1 hour: average duration,
    total request count, and the 5 slowest endpoint paths.
    """
    # Check if the table exists (graceful degradation if migration not run)
    try:
        summary = await db.execute(
            text("""
                SELECT
                    COUNT(*) AS request_count,
                    COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
                    COALESCE(MAX(duration_ms), 0) AS max_duration_ms,
                    COALESCE(MIN(duration_ms), 0) AS min_duration_ms
                FROM api_request_log
                WHERE timestamp >= NOW() - INTERVAL '1 hour'
            """)
        )
        row = summary.mappings().first()

        slowest = await db.execute(
            text("""
                SELECT path, method, AVG(duration_ms) AS avg_duration_ms, COUNT(*) AS hits
                FROM api_request_log
                WHERE timestamp >= NOW() - INTERVAL '1 hour'
                GROUP BY path, method
                ORDER BY avg_duration_ms DESC
                LIMIT 5
            """)
        )
        slowest_rows = [dict(r) for r in slowest.mappings().all()]

        return {
            "period": "last_1_hour",
            "request_count": row["request_count"],
            "avg_duration_ms": round(float(row["avg_duration_ms"]), 2),
            "max_duration_ms": round(float(row["max_duration_ms"]), 2),
            "min_duration_ms": round(float(row["min_duration_ms"]), 2),
            "slowest_endpoints": slowest_rows,
        }
    except Exception:
        return {
            "period": "last_1_hour",
            "request_count": 0,
            "avg_duration_ms": 0,
            "max_duration_ms": 0,
            "min_duration_ms": 0,
            "slowest_endpoints": [],
            "note": "api_request_log table not available — run migration 015",
        }
