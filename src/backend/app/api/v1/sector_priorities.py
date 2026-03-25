"""Sector priority roles — occupations ranked by AI impact within an industry.

Combines exposure (Eloundou Beta), empirical usage (Microsoft AI, AEI),
drift velocity, employment concentration (location quotient), and headcount
into a composite impact score.

Priority = the roles a sector leader should focus on first.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(tags=["sectors"])


class PriorityRole(BaseModel):
    soc_code: str
    occupation_title: str
    headcount: int | None = None
    employment_share: float | None = None
    location_quotient: float | None = None
    eloundou_beta: float | None = None
    ms_ai_applicability: float | None = None
    aei_exposure: float | None = None
    dominant_zone: str | None = None
    drift_velocity: float | None = None
    drift_classification: str | None = None
    impact_score: float | None = None
    risk_factors: list[str] = []


class SectorPrioritiesResponse(BaseModel):
    naics_code: str
    naics_title: str
    total_employment: int | None = None
    occupation_count: int
    priority_roles: list[PriorityRole]
    full_mix: list[PriorityRole]


@router.get("/sectors/{naics_code}/priorities", response_model=SectorPrioritiesResponse)
async def get_sector_priorities(
    naics_code: str,
    top_n: int = Query(10, ge=1, le=50, description="Number of priority roles to highlight"),
    region: str = Query("US", pattern="^(US|AU)$", description="US (NAICS) or AU (ANZSIC)"),
    db: AsyncSession = Depends(get_db),
) -> SectorPrioritiesResponse:
    """Get sector occupations ranked by AI impact priority.

    Computes a composite impact score for each occupation:
    - Exposure component: max of Eloundou Beta, Microsoft applicability (normalised)
    - Employment weight: headcount relative to sector total
    - Drift component: positive velocity amplifies priority
    - Concentration: location quotient (sector concentration vs national average)

    Returns priority_roles (top N) and full_mix (all occupations).
    Works for both US (NAICS) and AU (ANZSIC) by filtering on region.
    """
    # Use industry_occupation_profiles for national totals — works for both regions
    # since profiles already contain headcount per (sector, soc, region)
    r = await db.execute(text("""
        WITH sector_total AS (
            SELECT SUM(headcount) AS total_emp
            FROM industry_occupation_profiles
            WHERE naics_code = :naics_code AND region = :region AND headcount IS NOT NULL
        ),
        national_total AS (
            SELECT onet_soc, SUM(headcount) AS national_emp
            FROM industry_occupation_profiles
            WHERE region = :region AND headcount IS NOT NULL
            GROUP BY onet_soc
        ),
        national_grand AS (
            SELECT SUM(headcount) AS grand_total FROM industry_occupation_profiles
            WHERE region = :region AND headcount IS NOT NULL
        ),
        sector_roles AS (
            SELECT
                p.onet_soc AS soc_code,
                p.occupation_title,
                p.naics_title,
                p.headcount,
                p.employment_share,
                -- Location quotient: (sector share) / (national share)
                CASE
                    WHEN nt.national_emp > 0 AND st.total_emp > 0 AND ng.grand_total > 0
                    THEN (p.headcount::FLOAT / st.total_emp) / (nt.national_emp::FLOAT / ng.grand_total)
                    ELSE NULL
                END AS location_quotient,
                p.eloundou_beta,
                p.ms_ai_applicability,
                p.aei_exposure,
                p.dominant_zone,
                p.drift_velocity,
                p.drift_classification,
                -- Composite impact score
                -- Weighted: exposure (40%) × headcount_share (30%) × concentration (15%) × drift (15%)
                (
                    COALESCE(GREATEST(
                        COALESCE(p.eloundou_beta, 0) / 1.5,  -- normalise Beta (max ~1.5) to 0-1
                        COALESCE(p.ms_ai_applicability, 0) / 0.5  -- normalise MS (max ~0.5) to 0-1
                    ), 0) * 0.40
                    +
                    COALESCE(p.employment_share, 0) * 0.30
                    +
                    LEAST(COALESCE(
                        CASE
                            WHEN nt.national_emp > 0 AND st.total_emp > 0 AND ng.grand_total > 0
                            THEN (p.headcount::FLOAT / st.total_emp) / (nt.national_emp::FLOAT / ng.grand_total)
                            ELSE 0
                        END, 0) / 5.0, 1.0) * 0.15  -- normalise LQ (cap at 5) to 0-1
                    +
                    LEAST(GREATEST(COALESCE(p.drift_velocity, 0) * 10000, 0), 1.0) * 0.15  -- normalise velocity to 0-1
                ) AS impact_score
            FROM industry_occupation_profiles p
            CROSS JOIN sector_total st
            CROSS JOIN national_grand ng
            LEFT JOIN national_total nt ON nt.onet_soc = p.onet_soc
            WHERE p.naics_code = :naics_code AND p.region = :region
              AND p.headcount IS NOT NULL
        )
        SELECT * FROM sector_roles
        ORDER BY impact_score DESC NULLS LAST
    """), {"naics_code": naics_code, "region": region})

    rows = r.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"Sector {naics_code} not found")

    naics_title = rows[0][2]
    total_emp = sum(row[3] or 0 for row in rows)

    def to_role(row: tuple) -> PriorityRole:
        risk_factors = []
        if row[6] and row[6] >= 0.85:
            risk_factors.append("High Eloundou exposure (E2 zone)")
        elif row[6] and row[6] >= 0.40:
            risk_factors.append("Moderate Eloundou exposure (E1 zone)")
        if row[5] and row[5] > 2.0:
            risk_factors.append(f"Sector-concentrated (LQ={row[5]:.1f})")
        if row[10] and row[10] > 0:
            risk_factors.append("Positive drift velocity (departing)")
        if row[11] == "below_threshold":
            risk_factors.append("Approaching zone threshold")
        if row[3] and row[3] > 10000:
            risk_factors.append(f"Large workforce ({row[3]:,} employees)")

        return PriorityRole(
            soc_code=row[0],
            occupation_title=row[1] or row[0],
            headcount=row[3],
            employment_share=round(row[4], 4) if row[4] else None,
            location_quotient=round(row[5], 2) if row[5] else None,
            eloundou_beta=round(row[6], 4) if row[6] else None,
            ms_ai_applicability=round(row[7], 4) if row[7] else None,
            aei_exposure=round(row[8], 4) if row[8] else None,
            dominant_zone=row[9],
            drift_velocity=round(row[10], 6) if row[10] else None,
            drift_classification=row[11],
            impact_score=round(row[12], 4) if row[12] else None,
            risk_factors=risk_factors,
        )

    all_roles = [to_role(row) for row in rows]

    return SectorPrioritiesResponse(
        naics_code=naics_code,
        naics_title=naics_title,
        total_employment=total_emp,
        occupation_count=len(all_roles),
        priority_roles=all_roles[:top_n],
        full_mix=all_roles,
    )
