"""Composite sector endpoint — blends multiple NAICS sectors into a single
employment-weighted impact profile for multi-industry organisations.

Returns de-duplicated occupations across selected sectors with combined
headcount and employment-weighted exposure scores.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(prefix="/sectors", tags=["sectors"])


class CompositeOccupation(BaseModel):
    onet_soc: str
    occupation_title: str
    total_headcount: int
    sectors: list[str]  # NAICS titles this occupation appears in
    eloundou_beta: float | None = None
    ms_ai_applicability: float | None = None
    aei_exposure: float | None = None
    dominant_zone: str | None = None
    drift_velocity: float | None = None
    drift_classification: str | None = None


class CompositeSectorResponse(BaseModel):
    codes: list[str]
    sector_names: list[str]
    total_employment: int
    occupation_count: int
    weighted_eloundou_beta: float | None = None
    weighted_ms_applicability: float | None = None
    weighted_aei_exposure: float | None = None
    workers_e0: int = 0
    workers_e1: int = 0
    workers_e2: int = 0
    occupations: list[CompositeOccupation]


@router.get("/composite", response_model=CompositeSectorResponse)
async def composite_sector_analysis(
    codes: str = Query(
        ...,
        description="Comma-separated NAICS codes (minimum 2)",
        examples=["62,54,51"],
    ),
    db: AsyncSession = Depends(get_db),
) -> CompositeSectorResponse:
    """Blend multiple sectors into a composite impact profile.

    Aggregates occupations across selected sectors:
    - De-duplicates by SOC code, summing headcount
    - Computes employment-weighted exposure scores
    - Tracks which sectors each occupation appears in
    """
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    if len(code_list) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 sector codes required for composite analysis",
        )

    # Validate all codes exist and get sector names
    validate_r = await db.execute(
        text("""
            SELECT DISTINCT naics_code, naics_title
            FROM industry_occupation_profiles
            WHERE naics_code = ANY(:codes)
        """),
        {"codes": code_list},
    )
    found = {row[0]: row[1] for row in validate_r.fetchall()}
    missing = [c for c in code_list if c not in found]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Sector codes not found: {', '.join(missing)}",
        )

    # Aggregate occupations across selected sectors
    # De-duplicate by SOC, SUM headcount, employment-weighted scores
    r = await db.execute(
        text("""
            SELECT
                p.onet_soc,
                p.occupation_title,
                SUM(p.headcount) AS total_headcount,
                ARRAY_AGG(DISTINCT p.naics_title ORDER BY p.naics_title) AS sectors,
                -- Employment-weighted scores (per-occupation across selected sectors)
                SUM(p.headcount * COALESCE(p.eloundou_beta, 0))
                    / NULLIF(SUM(CASE WHEN p.eloundou_beta IS NOT NULL
                                      THEN p.headcount END), 0)
                    AS w_eloundou_beta,
                SUM(p.headcount * COALESCE(p.ms_ai_applicability, 0))
                    / NULLIF(SUM(CASE WHEN p.ms_ai_applicability IS NOT NULL
                                      THEN p.headcount END), 0)
                    AS w_ms_applicability,
                SUM(p.headcount * COALESCE(p.aei_exposure, 0))
                    / NULLIF(SUM(CASE WHEN p.aei_exposure IS NOT NULL
                                      THEN p.headcount END), 0)
                    AS w_aei_exposure,
                -- Use the dominant zone from the largest headcount sector
                (ARRAY_AGG(p.dominant_zone ORDER BY p.headcount DESC))[1]
                    AS dominant_zone,
                -- Drift: use maximum velocity across sectors (most aggressive signal)
                MAX(p.drift_velocity) AS drift_velocity,
                -- Classification from highest-headcount sector
                (ARRAY_AGG(p.drift_classification ORDER BY p.headcount DESC))[1]
                    AS drift_classification
            FROM industry_occupation_profiles p
            WHERE p.naics_code = ANY(:codes)
            GROUP BY p.onet_soc, p.occupation_title
            ORDER BY SUM(p.headcount) DESC NULLS LAST
        """),
        {"codes": code_list},
    )
    rows = r.fetchall()

    occupations = []
    total_employment = 0
    workers_e0 = 0
    workers_e1 = 0
    workers_e2 = 0
    # Accumulators for composite weighted scores
    sum_hc_beta = 0.0
    sum_hc_beta_w = 0
    sum_hc_ms = 0.0
    sum_hc_ms_w = 0
    sum_hc_aei = 0.0
    sum_hc_aei_w = 0

    for row in rows:
        hc = row[2] or 0
        total_employment += hc
        zone = row[7]
        if zone == "E0":
            workers_e0 += hc
        elif zone == "E1":
            workers_e1 += hc
        elif zone == "E2":
            workers_e2 += hc

        beta = round(float(row[4]), 4) if row[4] is not None else None
        ms = round(float(row[5]), 4) if row[5] is not None else None
        aei = round(float(row[6]), 4) if row[6] is not None else None

        if beta is not None:
            sum_hc_beta += hc * beta
            sum_hc_beta_w += hc
        if ms is not None:
            sum_hc_ms += hc * ms
            sum_hc_ms_w += hc
        if aei is not None:
            sum_hc_aei += hc * aei
            sum_hc_aei_w += hc

        occupations.append(CompositeOccupation(
            onet_soc=row[0],
            occupation_title=row[1] or row[0],
            total_headcount=hc,
            sectors=row[3] or [],
            eloundou_beta=beta,
            ms_ai_applicability=ms,
            aei_exposure=aei,
            dominant_zone=zone,
            drift_velocity=round(float(row[8]), 6) if row[8] is not None else None,
            drift_classification=row[9],
        ))

    return CompositeSectorResponse(
        codes=code_list,
        sector_names=[found[c] for c in code_list],
        total_employment=total_employment,
        occupation_count=len(occupations),
        weighted_eloundou_beta=(
            round(sum_hc_beta / sum_hc_beta_w, 4) if sum_hc_beta_w else None
        ),
        weighted_ms_applicability=(
            round(sum_hc_ms / sum_hc_ms_w, 4) if sum_hc_ms_w else None
        ),
        weighted_aei_exposure=(
            round(sum_hc_aei / sum_hc_aei_w, 4) if sum_hc_aei_w else None
        ),
        workers_e0=workers_e0,
        workers_e1=workers_e1,
        workers_e2=workers_e2,
        occupations=occupations,
    )
