"""Composite sector endpoint — blends multiple NAICS sectors into a single
employment-weighted impact profile for multi-industry organisations.

Returns de-duplicated occupations across selected sectors with combined
headcount and employment-weighted exposure scores.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import (
    OccupationMixEntry,
    SubdivisionEntry,
    SubdivisionOccupationProfile,
    SubdivisionOccupationRow,
)
from app.db.session import get_db

router = APIRouter(prefix="/sectors", tags=["sectors"])


async def _load_au_occupation_mix(
    db: AsyncSession,
    code_list: list[str],
) -> list[OccupationMixEntry] | None:
    """Load aggregated Census occupation mix for selected AU sectors."""
    mix_r = await db.execute(
        text(
            """
        SELECT anzsco_major_group, anzsco_major_group_name,
               SUM(employed_count) AS employed_count
        FROM abs_census_wpp
        WHERE anzsic_division_code = ANY(:codes)
          AND geography_code = 'AUS' AND census_year = 2021
          AND anzsco_major_group IS NOT NULL
        GROUP BY anzsco_major_group, anzsco_major_group_name
        ORDER BY SUM(employed_count) DESC NULLS LAST
    """
        ),
        {"codes": code_list},
    )
    mix_rows = mix_r.fetchall()
    if not mix_rows:
        return None
    mix_total = sum(row[2] or 0 for row in mix_rows)
    return [
        OccupationMixEntry(
            anzsco_major_group=row[0],
            major_group_name=row[1],
            employed_count=row[2] or 0,
            share_pct=(round((row[2] or 0) / mix_total * 100, 1) if mix_total > 0 else 0),
        )
        for row in mix_rows
    ]


async def _load_au_subdivisions(
    db: AsyncSession,
    code_list: list[str],
) -> dict[str, list[SubdivisionEntry]] | None:
    """Load subdivisions for each AU sector in the composite."""
    r = await db.execute(
        text(
            """
        SELECT anzsic_division_code, subdivision_name, employment
        FROM anzsic_subdivisions
        WHERE anzsic_division_code = ANY(:codes)
          AND release_year = 2025 AND employment IS NOT NULL
        ORDER BY anzsic_division_code, employment DESC
    """
        ),
        {"codes": code_list},
    )
    rows = r.fetchall()
    if not rows:
        return None
    # Group by division, compute share_pct within each
    from collections import defaultdict

    grouped: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for div_code, name, emp in rows:
        grouped[div_code].append((name, emp))
    result: dict[str, list[SubdivisionEntry]] = {}
    for div_code, subs in grouped.items():
        total = sum(e for _, e in subs)
        result[div_code] = [
            SubdivisionEntry(
                subdivision_name=name,
                employment=emp,
                share_pct=round(emp / total * 100, 1) if total > 0 else 0,
            )
            for name, emp in subs[:8]  # Top 8 per sector
        ]
    return result


async def _load_subdivision_occupation_mix(
    db: AsyncSession,
    code_list: list[str],
) -> list[SubdivisionOccupationProfile] | None:
    """Load per-subdivision occupation breakdowns from Census 2021 cross-tab.

    Returns occupation profiles for each ANZSIC subdivision within the
    selected divisions — e.g., within Electricity (D), shows that
    Electricity Supply is 35% Technicians while Gas Supply is 40%
    Machinery Operators.
    """
    r = await db.execute(
        text(
            """
        SELECT indp_name, anzsic_division_code,
               anzsco_major_group, anzsco_major_group_name,
               employed_count
        FROM abs_census_subdivision_occ
        WHERE anzsic_division_code = ANY(:codes)
          AND census_year = 2021
        ORDER BY anzsic_division_code, indp_name,
                 employed_count DESC
    """
        ),
        {"codes": code_list},
    )
    rows = r.fetchall()
    if not rows:
        return None

    # Group by subdivision (indp_name)
    from collections import defaultdict

    grouped: dict[str, list[tuple]] = defaultdict(list)
    div_map: dict[str, str] = {}
    for indp_name, div_code, mg, mg_name, count in rows:
        grouped[indp_name].append((mg, mg_name, count))
        div_map[indp_name] = div_code

    profiles: list[SubdivisionOccupationProfile] = []
    for indp_name, occ_rows in grouped.items():
        total = sum(c for _, _, c in occ_rows)
        if total == 0:
            continue
        occupations = [
            SubdivisionOccupationRow(
                anzsco_major_group=mg,
                major_group_name=mg_name,
                employed_count=count,
                share_pct=round(count / total * 100, 1),
            )
            for mg, mg_name, count in occ_rows
        ]
        profiles.append(
            SubdivisionOccupationProfile(
                indp_name=indp_name,
                anzsic_division_code=div_map[indp_name],
                total_employed=total,
                occupations=occupations,
            )
        )

    # Sort by total employed descending for most impactful subdivisions first
    profiles.sort(key=lambda p: p.total_employed, reverse=True)
    return profiles if profiles else None


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
    company_name: str | None = None  # Populated when accessed via company lookup
    total_employment: int
    occupation_count: int
    weighted_eloundou_beta: float | None = None
    weighted_ms_applicability: float | None = None
    weighted_aei_exposure: float | None = None
    workers_e0: int = 0
    workers_e1: int = 0
    workers_e2: int = 0
    occupation_mix: list[OccupationMixEntry] | None = None
    subdivisions: dict[str, list[SubdivisionEntry]] | None = None
    subdivision_occupation_mix: list[SubdivisionOccupationProfile] | None = None
    occupations: list[CompositeOccupation]


@router.get("/composite", response_model=CompositeSectorResponse)
async def composite_sector_analysis(
    codes: str = Query(
        ...,
        description="Comma-separated sector codes (minimum 2). NAICS for US, ANZSIC for AU.",
        examples=["62,54,51"],
    ),
    region: str = Query("US", pattern="^(US|AU|us|au)$", description="US (NAICS) or AU (ANZSIC)"),
    company: str | None = Query(None, description="Company name for context"),
    db: AsyncSession = Depends(get_db),
) -> CompositeSectorResponse:
    """Blend multiple sectors into a composite impact profile.

    Aggregates occupations across selected sectors:
    - De-duplicates by SOC code, summing headcount
    - Computes employment-weighted exposure scores
    - Tracks which sectors each occupation appears in
    """
    region = region.upper()
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    if len(code_list) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 sector codes required for composite analysis",
        )

    # Validate all codes exist and get sector names
    validate_r = await db.execute(
        text(
            """
            SELECT DISTINCT naics_code, naics_title
            FROM industry_occupation_profiles
            WHERE naics_code = ANY(:codes) AND region = :region
        """
        ),
        {"codes": code_list, "region": region},
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
        text(
            """
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
            WHERE p.naics_code = ANY(:codes) AND p.region = :region
            GROUP BY p.onet_soc, p.occupation_title
            ORDER BY SUM(p.headcount) DESC NULLS LAST
        """
        ),
        {"codes": code_list, "region": region},
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

        occupations.append(
            CompositeOccupation(
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
            )
        )

    # Aggregate Census occupation mix + subdivisions for AU sectors
    occupation_mix = await _load_au_occupation_mix(db, code_list) if region == "AU" else None
    subdivisions = await _load_au_subdivisions(db, code_list) if region == "AU" else None
    subdivision_occupation_mix = (
        await _load_subdivision_occupation_mix(db, code_list) if region == "AU" else None
    )

    return CompositeSectorResponse(
        codes=code_list,
        sector_names=[found[c] for c in code_list],
        company_name=company,
        total_employment=total_employment,
        occupation_count=len(occupations),
        weighted_eloundou_beta=(round(sum_hc_beta / sum_hc_beta_w, 4) if sum_hc_beta_w else None),
        weighted_ms_applicability=(round(sum_hc_ms / sum_hc_ms_w, 4) if sum_hc_ms_w else None),
        weighted_aei_exposure=(round(sum_hc_aei / sum_hc_aei_w, 4) if sum_hc_aei_w else None),
        workers_e0=workers_e0,
        workers_e1=workers_e1,
        workers_e2=workers_e2,
        occupation_mix=occupation_mix,
        subdivisions=subdivisions,
        subdivision_occupation_mix=subdivision_occupation_mix,
        occupations=occupations,
    )
