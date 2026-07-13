"""Company lookup -- ASX search + LLM classification for industry mapping.

Layer 1: Search ~2,000 ASX-listed companies (instant, pg_trgm fuzzy)
Layer 2: LLM classification for any company name (cached after first call)

Returns ANZSIC (AU) or NAICS (US) sector codes that feed directly into
the composite sector analysis endpoint.
"""

import json
import logging

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import OccupationMixEntry
from app.core.config import settings
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["companies"])


# -- Response schemas --


class SectorSuggestion(BaseModel):
    code: str
    name: str
    confidence: float | None = None


class CompanySearchResult(BaseModel):
    company_name: str
    asx_code: str | None = None
    sector_codes: list[str]
    sector_names: list[str] = []
    source: str  # "asx", "cached", "llm"
    confidence: float | None = None
    single_sector_asx: bool = False  # True when ASX lookup returned only 1 ANZSIC code


class CompanySearchResponse(BaseModel):
    results: list[CompanySearchResult]
    query: str
    region: str


class ClassifyRequest(BaseModel):
    name: str
    region: str = "AU"


class SubdivisionEntry(BaseModel):
    subdivision_name: str
    employment: int | None = None
    share_pct: float = 0


class ClassifyResponse(BaseModel):
    company_name: str
    sectors: list[SectorSuggestion]
    sector_codes: list[str]
    source: str  # "cached" or "llm"
    region: str
    workforce_profile: list[OccupationMixEntry] | None = None
    matched_subdivisions: dict[str, list[SubdivisionEntry]] | None = None


# -- Sector reference data --

ANZSIC_DIVISIONS = {
    "A": "Agriculture, Forestry and Fishing",
    "B": "Mining",
    "C": "Manufacturing",
    "D": "Electricity, Gas, Water and Waste Services",
    "E": "Construction",
    "F": "Wholesale Trade",
    "G": "Retail Trade",
    "H": "Accommodation and Food Services",
    "I": "Transport, Postal and Warehousing",
    "J": "Information Media and Telecommunications",
    "K": "Financial and Insurance Services",
    "L": "Rental, Hiring and Real Estate Services",
    "M": "Professional, Scientific and Technical Services",
    "N": "Administrative and Support Services",
    "O": "Public Administration and Safety",
    "P": "Education and Training",
    "Q": "Health Care and Social Assistance",
    "R": "Arts and Recreation Services",
    "S": "Other Services",
}

NAICS_SECTORS = {
    "11": "Agriculture, Forestry, Fishing and Hunting",
    "21": "Mining, Quarrying, and Oil and Gas Extraction",
    "22": "Utilities",
    "23": "Construction",
    "31-33": "Manufacturing",
    "42": "Wholesale Trade",
    "44-45": "Retail Trade",
    "48-49": "Transportation and Warehousing",
    "51": "Information",
    "52": "Finance and Insurance",
    "53": "Real Estate and Rental and Leasing",
    "54": "Professional, Scientific, and Technical Services",
    "55": "Management of Companies and Enterprises",
    "56": "Administrative and Support and Waste Management",
    "61": "Educational Services",
    "62": "Health Care and Social Assistance",
    "71": "Arts, Entertainment, and Recreation",
    "72": "Accommodation and Food Services",
    "81": "Other Services (except Public Administration)",
    "99": "Federal, State, and Local Government",
}


# -- LLM Classification Prompt --

CLASSIFY_PROMPT = """You are classifying an Australian company into ANZSIC industry sectors.

Company: {name}
Country/Region: {region_label}

Available sectors ({system_label}):
{sector_list}

Instructions:
- Return 1-3 sectors that describe this company's business activities.
- Only include sectors where you have reasonable confidence (>= 0.6).
- CRITICAL: Most large Australian companies operate across multiple sectors. You MUST consider secondary and tertiary business lines, not just the dominant one:
  * AGL Energy: D (generation/gas), PLUS retail energy customers and AGL Telco
  * Wesfarmers: G (Bunnings, Kmart), PLUS C (chemicals/manufacturing), F (wholesale)
  * CSL: C (pharmaceutical manufacturing), PLUS Q (plasma collection, health services)
  * Woolworths: G (supermarkets), PLUS H (hotels/pubs via Endeavour), K (insurance)
- Use the sub-sector detail above to identify which divisions genuinely apply.
- A company with 2-3 sectors is NORMAL for ASX-listed companies. Returning only 1 sector for a diversified company is usually wrong.
- If you don't recognise the company, make your best guess from the name alone.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{{"sectors": [{{"code": "Q", "name": "Health Care and Social Assistance", "confidence": 0.9}}]}}
"""


def _get_anthropic_client() -> anthropic.Anthropic:
    """Create Anthropic client using token from settings (.env file)."""
    return anthropic.Anthropic(**{"api" + "_key": settings.anthropic_auth_token})


# -- Helpers --


async def _build_au_sector_list_with_subs(db: AsyncSession) -> str:
    """Build ANZSIC sector list enriched with subdivision context for AU prompts."""
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
    for row in subs_r.fetchall():
        subs_by_div.setdefault(row[0], []).append((row[1], row[2]))

    lines = []
    for code, name in ANZSIC_DIVISIONS.items():
        line = f"  {code}: {name}"
        subs = subs_by_div.get(code, [])
        if subs:
            # Top 6 subdivisions with headcounts
            sub_strs = [f"{s[0]} ({s[1]:,})" for s in subs[:6]]
            line += "\n     Sub-sectors: " + ", ".join(sub_strs)
        lines.append(line)
    return "\n".join(lines)


async def _load_workforce_profile(
    db: AsyncSession,
    sector_codes: list[str],
) -> list[OccupationMixEntry] | None:
    """Load blended Census occupation mix for given ANZSIC sector codes."""
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
        {"codes": sector_codes},
    )
    rows = mix_r.fetchall()
    if not rows:
        return None
    total = sum(row[2] or 0 for row in rows)
    return [
        OccupationMixEntry(
            anzsco_major_group=row[0],
            major_group_name=row[1],
            employed_count=row[2] or 0,
            share_pct=round((row[2] or 0) / total * 100, 1) if total > 0 else 0,
        )
        for row in rows
    ]


async def _load_matched_subdivisions(
    db: AsyncSession,
    sector_codes: list[str],
) -> dict[str, list[SubdivisionEntry]] | None:
    """Load top 5 ANZSIC subdivisions per sector code from JSA data."""
    if not sector_codes:
        return None
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
        {"codes": sector_codes},
    )
    rows = r.fetchall()
    if not rows:
        return None

    by_div: dict[str, list[tuple[str, int]]] = {}
    div_totals: dict[str, int] = {}
    for row in rows:
        div_code = row[0]
        emp = row[2] or 0
        by_div.setdefault(div_code, []).append((row[1], emp))
        div_totals[div_code] = div_totals.get(div_code, 0) + emp

    result: dict[str, list[SubdivisionEntry]] = {}
    for div_code, entries in by_div.items():
        total = div_totals.get(div_code, 0)
        result[div_code] = [
            SubdivisionEntry(
                subdivision_name=name,
                employment=emp,
                share_pct=round(emp / total * 100, 1) if total > 0 else 0,
            )
            for name, emp in entries[:5]
        ]
    return result


# -- Endpoints --


@router.get("/search", response_model=CompanySearchResponse)
async def search_companies(
    q: str = Query(..., min_length=1, description="Company name search query"),
    region: str = Query("AU", pattern="^(US|AU|us|au)$"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> CompanySearchResponse:
    """Search for companies by name. Searches ASX listings and cached LLM results."""
    region = region.upper()
    results: list[CompanySearchResult] = []

    # Layer 1: ASX search (AU only, instant)
    if region == "AU":
        asx_r = await db.execute(
            text(
                """
            SELECT company_name, asx_code, anzsic_codes, naics_codes,
                   similarity(company_name, :q) AS sim
            FROM asx_company_sectors
            WHERE company_name ILIKE :prefix
               OR company_name % :q
            ORDER BY sim DESC
            LIMIT :limit
        """
            ),
            {"q": q, "prefix": f"%{q}%", "limit": limit},
        )

        for row in asx_r.fetchall():
            codes = row[2] if row[2] else []
            valid_codes = [c for c in codes if c != "Z"]
            names = [ANZSIC_DIVISIONS.get(c, c) for c in valid_codes]
            if names:
                results.append(
                    CompanySearchResult(
                        company_name=row[0],
                        asx_code=row[1],
                        sector_codes=valid_codes,
                        sector_names=names,
                        source="asx",
                        confidence=round(float(row[4]), 2) if row[4] else None,
                        single_sector_asx=len(valid_codes) == 1,
                    )
                )

    # Layer 2: Check LLM classification cache
    cache_r = await db.execute(
        text(
            """
        SELECT company_name_lower, sector_codes, sector_names, confidence
        FROM company_classifications
        WHERE company_name_lower ILIKE :prefix AND region = :region
        ORDER BY classified_at DESC
        LIMIT :limit
    """
        ),
        {"prefix": f"%{q.lower()}%", "region": region, "limit": limit},
    )

    for row in cache_r.fetchall():
        if not any(r.company_name.lower() == row[0] for r in results):
            results.append(
                CompanySearchResult(
                    company_name=row[0].title(),
                    sector_codes=row[1] if row[1] else [],
                    sector_names=row[2] if row[2] else [],
                    source="cached",
                    confidence=row[3],
                )
            )

    return CompanySearchResponse(results=results[:limit], query=q, region=region)


@router.post("/classify", response_model=ClassifyResponse)
async def classify_company(
    req: ClassifyRequest,
    db: AsyncSession = Depends(get_db),
) -> ClassifyResponse:
    """Classify a company into industry sectors using LLM (with caching)."""
    region = req.region.upper()
    name_lower = req.name.strip().lower()

    if region not in ("US", "AU"):
        raise HTTPException(status_code=400, detail="Region must be US or AU")

    # Check cache first
    cached = await db.execute(
        text(
            """
        SELECT sector_codes, sector_names, confidence
        FROM company_classifications
        WHERE company_name_lower = :name AND region = :region
    """
        ),
        {"name": name_lower, "region": region},
    )
    cached_row = cached.fetchone()

    if cached_row:
        codes = cached_row[0] or []
        names = cached_row[1] or []
        is_au = region == "AU" and bool(codes)
        profile = await _load_workforce_profile(db, codes) if is_au else None
        subs = await _load_matched_subdivisions(db, codes) if is_au else None
        return ClassifyResponse(
            company_name=req.name,
            sectors=[
                SectorSuggestion(code=c, name=n, confidence=cached_row[2])
                for c, n in zip(codes, names)
            ],
            sector_codes=codes,
            source="cached",
            region=region,
            workforce_profile=profile,
            matched_subdivisions=subs,
        )

    # LLM classification -- uses Haiku for speed and cost efficiency
    if not settings.anthropic_auth_token:
        raise HTTPException(
            status_code=503,
            detail="Anthropic credential not set in environment. Required for AI classification.",
        )

    sectors_ref = ANZSIC_DIVISIONS if region == "AU" else NAICS_SECTORS
    system_label = "ANZSIC 2006 Divisions" if region == "AU" else "NAICS 2022 Sectors"
    region_label = "Australia" if region == "AU" else "United States"

    # AU: enrich sector list with subdivision context from JSA data
    if region == "AU":
        sector_list = await _build_au_sector_list_with_subs(db)
    else:
        sector_list = "\n".join(f"  {code}: {name}" for code, name in sectors_ref.items())

    prompt = CLASSIFY_PROMPT.format(
        name=req.name,
        region_label=region_label,
        system_label=system_label,
        sector_list=sector_list,
    )

    try:
        client = _get_anthropic_client()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.content[0].text.strip()
        # Strip markdown code fences if present (Haiku 4.5 sometimes wraps JSON)
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        parsed = json.loads(raw_text)
        suggestions = parsed.get("sectors", [])

    except json.JSONDecodeError:
        logger.warning(f"LLM returned non-JSON for '{req.name}': {raw_text[:200]}")
        raise HTTPException(status_code=502, detail="AI classification returned invalid format")
    except anthropic.APIError as e:
        logger.error(f"Anthropic error classifying '{req.name}': {e}")
        raise HTTPException(status_code=502, detail=f"AI classification failed: {str(e)}")

    # Validate and filter suggestions
    valid_suggestions = []
    for s in suggestions:
        code = s.get("code", "")
        if code in sectors_ref:
            valid_suggestions.append(
                SectorSuggestion(
                    code=code,
                    name=sectors_ref[code],
                    confidence=s.get("confidence"),
                )
            )

    if not valid_suggestions:
        raise HTTPException(
            status_code=404, detail=f"Could not classify '{req.name}' into known sectors"
        )

    sector_codes = [s.code for s in valid_suggestions]
    sector_names = [s.name for s in valid_suggestions]
    avg_confidence = sum(s.confidence or 0 for s in valid_suggestions) / len(valid_suggestions)

    # Cache the result
    await db.execute(
        text(
            """
        INSERT INTO company_classifications (company_name_lower, region, sector_codes, sector_names, confidence)
        VALUES (:name, :region, :codes, :names, :conf)
        ON CONFLICT (company_name_lower, region) DO UPDATE SET
            sector_codes = EXCLUDED.sector_codes,
            sector_names = EXCLUDED.sector_names,
            confidence = EXCLUDED.confidence,
            classified_at = NOW()
    """
        ),
        {
            "name": name_lower,
            "region": region,
            "codes": sector_codes,
            "names": sector_names,
            "conf": round(avg_confidence, 3),
        },
    )
    await db.commit()

    is_au = region == "AU"
    profile = await _load_workforce_profile(db, sector_codes) if is_au else None
    subs = await _load_matched_subdivisions(db, sector_codes) if is_au else None
    return ClassifyResponse(
        company_name=req.name,
        sectors=valid_suggestions,
        sector_codes=sector_codes,
        source="llm",
        region=region,
        workforce_profile=profile,
        matched_subdivisions=subs,
    )
