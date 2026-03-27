"""Pipeline status and control endpoints (FR-8.8)."""

from datetime import datetime, UTC
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(prefix="/admin/pipeline", tags=["admin", "pipeline"])


@router.get("/status")
async def pipeline_status(db: AsyncSession = Depends(get_db)):
    """Return pipeline health: last run per stage from transformation_log."""
    result = await db.execute(text("""
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
    """))
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
    """Return the pipeline dependency DAG (static — for documentation/UI)."""
    return {
        "stages": [
            {
                "name": "onet",
                "depends_on": [],
                "optional": False,
                "description": "O*NET 28.1 reference data",
            },
            {
                "name": "eloundou",
                "depends_on": ["onet"],
                "optional": False,
                "description": "Eloundou exposure scores",
            },
            {
                "name": "microsoft_ai",
                "depends_on": ["onet"],
                "optional": False,
                "description": "Microsoft AI applicability",
            },
            {
                "name": "aei_labor",
                "depends_on": [],
                "optional": False,
                "description": "AEI labor market data",
            },
            {
                "name": "aei_temporal",
                "depends_on": [],
                "optional": False,
                "description": "AEI temporal snapshots",
            },
            {
                "name": "oews",
                "depends_on": [],
                "optional": False,
                "description": "BLS OEWS employment",
            },
            {
                "name": "gdpval",
                "depends_on": [],
                "optional": False,
                "description": "OpenAI GDPval benchmarks",
            },
            {
                "name": "derive_eloundou_dwas",
                "depends_on": ["eloundou", "onet"],
                "optional": False,
                "description": "Derived DWA scores",
            },
            {
                "name": "compute_drift",
                "depends_on": ["aei_temporal"],
                "optional": False,
                "description": "Task drift velocity",
            },
            {
                "name": "embed_titles",
                "depends_on": ["onet"],
                "optional": False,
                "description": "O*NET title embeddings",
            },
            {
                "name": "compute_profiles_us",
                "depends_on": ["oews", "eloundou", "microsoft_ai", "aei_labor", "compute_drift"],
                "optional": False,
                "description": "US industry profiles",
            },
            {
                "name": "ingest_crosswalk",
                "depends_on": [],
                "optional": True,
                "description": "NAICS\u2194ANZSIC crosswalk",
            },
            {
                "name": "ingest_abs",
                "depends_on": [],
                "optional": True,
                "description": "ABS AU employment",
            },
            {
                "name": "build_anzsco_concordance",
                "depends_on": ["embed_titles", "ingest_abs"],
                "optional": True,
                "description": "ANZSCO\u2192SOC mapping",
            },
            {
                "name": "compute_profiles_au",
                "depends_on": ["ingest_abs", "build_anzsco_concordance", "ingest_crosswalk"],
                "optional": True,
                "description": "AU industry profiles",
            },
            {
                "name": "ingest_asx_companies",
                "depends_on": [],
                "optional": True,
                "description": "ASX listed companies",
            },
        ]
    }
