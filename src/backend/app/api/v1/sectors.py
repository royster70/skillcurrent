"""Sector endpoints — industry sector views (US NAICS / AU ANZSIC)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import (
    OccupationMixEntry,
    OccupationSummary,
    SectorOccupationMix,
    SectorsResponse,
    SectorSummary,
    SubdivisionEntry,
)
from app.db.session import get_db

router = APIRouter(prefix="/sectors", tags=["sectors"])


@router.get("", response_model=SectorsResponse)
async def list_sectors(
    region: str = Query("US", pattern="^(US|AU|us|au)$", description="US (NAICS) or AU (ANZSIC)"),
    db: AsyncSession = Depends(get_db),
) -> SectorsResponse:
    """List all sectors with aggregate AI exposure stats.

    US returns NAICS sectors; AU returns ANZSIC divisions.
    """
    region = region.upper()
    r = await db.execute(
        text(
            """
        SELECT
            naics_code, naics_title,
            COUNT(DISTINCT onet_soc) AS occupation_count,
            SUM(headcount) AS total_employment,
            AVG(eloundou_beta) AS avg_eloundou_beta,
            AVG(ms_ai_applicability) AS avg_ms_applicability,
            AVG(aei_exposure) AS avg_aei_exposure,
            SUM(CASE WHEN dominant_zone = 'E0' THEN 1 ELSE 0 END) AS zone_e0,
            SUM(CASE WHEN dominant_zone = 'E1' THEN 1 ELSE 0 END) AS zone_e1,
            SUM(CASE WHEN dominant_zone = 'E2' THEN 1 ELSE 0 END) AS zone_e2,
            -- Employment-weighted score averages
            SUM(headcount * COALESCE(eloundou_beta, 0))
                / NULLIF(SUM(CASE WHEN eloundou_beta IS NOT NULL THEN headcount END), 0)
                AS weighted_eloundou_beta,
            SUM(headcount * COALESCE(ms_ai_applicability, 0))
                / NULLIF(SUM(CASE WHEN ms_ai_applicability IS NOT NULL THEN headcount END), 0)
                AS weighted_ms_applicability,
            SUM(headcount * COALESCE(aei_exposure, 0))
                / NULLIF(SUM(CASE WHEN aei_exposure IS NOT NULL THEN headcount END), 0)
                AS weighted_aei_exposure,
            -- Workers per zone (headcount, not occupation count)
            SUM(CASE WHEN dominant_zone = 'E0' THEN COALESCE(headcount, 0) ELSE 0 END) AS workers_e0,
            SUM(CASE WHEN dominant_zone = 'E1' THEN COALESCE(headcount, 0) ELSE 0 END) AS workers_e1,
            SUM(CASE WHEN dominant_zone = 'E2' THEN COALESCE(headcount, 0) ELSE 0 END) AS workers_e2
        FROM industry_occupation_profiles
        WHERE region = :region
        GROUP BY naics_code, naics_title
        ORDER BY SUM(headcount) DESC NULLS LAST
    """
        ),
        {"region": region},
    )
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
            weighted_eloundou_beta=round(row[10], 4) if row[10] else None,
            weighted_ms_applicability=round(row[11], 4) if row[11] else None,
            weighted_aei_exposure=round(row[12], 4) if row[12] else None,
            workers_e0=row[13] or 0,
            workers_e1=row[14] or 0,
            workers_e2=row[15] or 0,
        )
        for row in r.fetchall()
    ]
    # Enrich AU sectors with Census occupation mix from abs_census_wpp (W12A)
    if region == "AU" and sectors:
        mix_r = await db.execute(
            text(
                """
            SELECT anzsic_division_code, anzsco_major_group,
                   anzsco_major_group_name, employed_count
            FROM abs_census_wpp
            WHERE geography_code = 'AUS' AND census_year = 2021
              AND anzsco_major_group IS NOT NULL
            ORDER BY anzsic_division_code, employed_count DESC NULLS LAST
        """
            )
        )
        # Group by division code and compute shares
        mix_by_div: dict[str, list[OccupationMixEntry]] = {}
        div_totals: dict[str, int] = {}
        for row in mix_r.fetchall():
            div_code = row[0]
            count = row[3] or 0
            div_totals[div_code] = div_totals.get(div_code, 0) + count
            mix_by_div.setdefault(div_code, []).append((row[1], row[2], count))
        for div_code, entries in mix_by_div.items():
            total = div_totals.get(div_code, 0)
            mix_by_div[div_code] = [
                OccupationMixEntry(
                    anzsco_major_group=e[0],
                    major_group_name=e[1],
                    employed_count=e[2],
                    share_pct=round(e[2] / total * 100, 1) if total > 0 else 0,
                )
                for e in entries
            ]
        for sector in sectors:
            sector.occupation_mix = mix_by_div.get(sector.naics_code)

    # Enrich AU sectors with ANZSIC subdivisions from JSA Industry Data Table 3
    if region == "AU" and sectors:
        subs_r = await db.execute(
            text(
                """
            SELECT anzsic_division_code, subdivision_name, employment
            FROM anzsic_subdivisions
            WHERE release_year = 2025 AND employment IS NOT NULL
            ORDER BY anzsic_division_code, employment DESC
        """
            )
        )
        subs_by_div: dict[str, list[tuple[str, int]]] = {}
        div_totals: dict[str, int] = {}
        for row in subs_r.fetchall():
            div_code = row[0]
            emp = row[2] or 0
            subs_by_div.setdefault(div_code, []).append((row[1], emp))
            div_totals[div_code] = div_totals.get(div_code, 0) + emp
        for sector in sectors:
            entries = subs_by_div.get(sector.naics_code, [])
            if entries:
                total = div_totals.get(sector.naics_code, 0)
                sector.subdivisions = [
                    SubdivisionEntry(
                        subdivision_name=name,
                        employment=emp,
                        share_pct=round(emp / total * 100, 1) if total > 0 else 0,
                    )
                    for name, emp in entries
                ]

    return SectorsResponse(sectors=sectors, total_sectors=len(sectors), region=region)


@router.get("/{sector_code}/subdivisions", response_model=list[SubdivisionEntry])
async def get_sector_subdivisions(
    sector_code: str,
    db: AsyncSession = Depends(get_db),
) -> list[SubdivisionEntry]:
    """ANZSIC subdivisions for an AU sector from JSA Industry Data Table 3.

    Returns employment breakdown by subdivision within the given
    ANZSIC division code (e.g. "D" → Electricity Generation, Gas Supply, etc.).
    """
    r = await db.execute(
        text(
            """
        SELECT subdivision_name, employment
        FROM anzsic_subdivisions
        WHERE anzsic_division_code = :code
          AND release_year = 2025 AND employment IS NOT NULL
        ORDER BY employment DESC
    """
        ),
        {"code": sector_code.upper()},
    )
    rows = r.fetchall()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No subdivisions for sector {sector_code}",
        )

    total = sum(row[1] or 0 for row in rows)
    return [
        SubdivisionEntry(
            subdivision_name=row[0],
            employment=row[1] or 0,
            share_pct=round((row[1] or 0) / total * 100, 1) if total > 0 else 0,
        )
        for row in rows
    ]


@router.get("/{sector_code}/occupation-mix", response_model=SectorOccupationMix)
async def get_sector_occupation_mix(
    sector_code: str,
    db: AsyncSession = Depends(get_db),
) -> SectorOccupationMix:
    """Census 2021 occupation mix for an AU sector (ANZSIC division).

    Returns the breakdown of ANZSCO major groups within this sector,
    with employed counts and percentage shares from W12A.
    """
    r = await db.execute(
        text(
            """
        SELECT anzsic_division_code, anzsic_division_name,
               anzsco_major_group, anzsco_major_group_name,
               employed_count, census_year
        FROM abs_census_wpp
        WHERE anzsic_division_code = :code
          AND geography_code = 'AUS' AND census_year = 2021
          AND anzsco_major_group IS NOT NULL
        ORDER BY employed_count DESC NULLS LAST
    """
        ),
        {"code": sector_code.upper()},
    )
    rows = r.fetchall()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No Census occupation mix for sector {sector_code}",
        )

    total = sum(row[4] or 0 for row in rows)
    mix = [
        OccupationMixEntry(
            anzsco_major_group=row[2],
            major_group_name=row[3],
            employed_count=row[4] or 0,
            share_pct=round((row[4] or 0) / total * 100, 1) if total > 0 else 0,
        )
        for row in rows
    ]

    return SectorOccupationMix(
        anzsic_division_code=rows[0][0],
        anzsic_division_name=rows[0][1],
        census_year=rows[0][5],
        total_employed=total,
        mix=mix,
    )


@router.get("/{naics_code}/occupations", response_model=list[OccupationSummary])
async def get_sector_occupations(
    naics_code: str,
    region: str = Query("US", pattern="^(US|AU|us|au)$"),
    db: AsyncSession = Depends(get_db),
) -> list[OccupationSummary]:
    """Get occupations within a sector, grouped by SOC major group."""
    region = region.upper()
    r = await db.execute(
        text(
            """
        SELECT
            p.onet_soc, p.occupation_title,
            SUBSTRING(p.onet_soc, 1, 2) || '-0000' AS major_group,
            p.headcount, p.eloundou_beta, p.ms_ai_applicability,
            p.aei_exposure, p.dominant_zone,
            p.drift_velocity, p.drift_classification
        FROM industry_occupation_profiles p
        WHERE p.naics_code = :naics_code AND p.region = :region
        ORDER BY p.headcount DESC NULLS LAST
    """
        ),
        {"naics_code": naics_code, "region": region},
    )

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
