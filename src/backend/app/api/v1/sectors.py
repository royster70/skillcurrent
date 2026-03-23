"""Sector endpoints — NAICS industry sector views."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import (
    OccupationSummary,
    SectorSummary,
    SectorsResponse,
)
from app.db.session import get_db

router = APIRouter(prefix="/sectors", tags=["sectors"])


@router.get("", response_model=SectorsResponse)
async def list_sectors(db: AsyncSession = Depends(get_db)) -> SectorsResponse:
    """List all NAICS sectors with aggregate AI exposure stats."""
    r = await db.execute(text("""
        SELECT
            naics_code, naics_title,
            COUNT(DISTINCT onet_soc) AS occupation_count,
            SUM(headcount) AS total_employment,
            AVG(eloundou_beta) AS avg_eloundou_beta,
            AVG(ms_ai_applicability) AS avg_ms_applicability,
            AVG(aei_exposure) AS avg_aei_exposure,
            SUM(CASE WHEN dominant_zone = 'E0' THEN 1 ELSE 0 END) AS zone_e0,
            SUM(CASE WHEN dominant_zone = 'E1' THEN 1 ELSE 0 END) AS zone_e1,
            SUM(CASE WHEN dominant_zone = 'E2' THEN 1 ELSE 0 END) AS zone_e2
        FROM industry_occupation_profiles
        GROUP BY naics_code, naics_title
        ORDER BY SUM(headcount) DESC NULLS LAST
    """))
    sectors = [
        SectorSummary(
            naics_code=row[0],
            naics_title=row[1],
            occupation_count=row[2],
            total_employment=row[3],
            avg_eloundou_beta=round(row[4], 4) if row[4] else None,
            avg_ms_applicability=round(row[5], 4) if row[5] else None,
            avg_aei_exposure=round(row[6], 4) if row[6] else None,
            zone_e0_count=row[7],
            zone_e1_count=row[8],
            zone_e2_count=row[9],
        )
        for row in r.fetchall()
    ]
    return SectorsResponse(sectors=sectors, total_sectors=len(sectors))


@router.get("/{naics_code}/occupations", response_model=list[OccupationSummary])
async def get_sector_occupations(
    naics_code: str,
    db: AsyncSession = Depends(get_db),
) -> list[OccupationSummary]:
    """Get occupations within a sector, grouped by SOC major group."""
    r = await db.execute(text("""
        SELECT
            p.onet_soc, p.occupation_title,
            SUBSTRING(p.onet_soc, 1, 2) || '-0000' AS major_group,
            p.headcount, p.eloundou_beta, p.ms_ai_applicability,
            p.aei_exposure, p.dominant_zone,
            p.drift_velocity, p.drift_classification
        FROM industry_occupation_profiles p
        WHERE p.naics_code = :naics_code
        ORDER BY p.headcount DESC NULLS LAST
    """), {"naics_code": naics_code})

    rows = r.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"Sector {naics_code} not found")

    return [
        OccupationSummary(
            soc_code=row[0],
            title=row[1] or row[0],
            major_group=row[2],
            headcount=row[3],
            eloundou_beta=round(row[4], 4) if row[4] else None,
            ms_ai_applicability=round(row[5], 4) if row[5] else None,
            aei_exposure=round(row[6], 4) if row[6] else None,
            dominant_zone=row[7],
            drift_velocity=round(row[8], 6) if row[8] else None,
            drift_classification=row[9],
        )
        for row in rows
    ]
