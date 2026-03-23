"""Search endpoint — find occupations by job title text."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(prefix="/search", tags=["search"])


class SearchResult(BaseModel):
    matched_title: str
    source: str  # 'sample' or 'alternate'
    soc_code: str
    occupation_title: str
    eloundou_beta: float | None = None
    ms_ai_applicability: float | None = None
    aei_exposure: float | None = None
    dominant_zone: str | None = None
    total_employment: int | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total: int


@router.get("", response_model=SearchResponse)
async def search_occupations(
    q: str = Query(..., min_length=2, description="Search query for job title"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Search O*NET sample and alternate titles for matching occupations.

    Searches 65,496 titles (7,953 sample + 57,543 alternate) using
    case-insensitive substring match. Returns matching occupations
    with three-tier scores and zone classification.
    """
    search_term = f"%{q}%"

    r = await db.execute(text("""
        WITH matched_titles AS (
            SELECT reported_job_title AS matched_title,
                   'sample' AS source,
                   onet_soc AS soc_code
            FROM onet_sample_titles
            WHERE LOWER(reported_job_title) LIKE LOWER(:q)

            UNION ALL

            SELECT alternate_title AS matched_title,
                   'alternate' AS source,
                   onet_soc AS soc_code
            FROM onet_alternate_titles
            WHERE LOWER(alternate_title) LIKE LOWER(:q)
        )
        SELECT DISTINCT ON (o.onet_soc)
            mt.matched_title,
            mt.source,
            o.onet_soc,
            o.title AS occupation_title,
            e.dv_beta_derived AS eloundou_beta,
            m.ai_applicability_score AS ms_ai_applicability,
            a.observed_exposure AS aei_exposure,
            CASE
                WHEN e.dv_beta_derived >= 0.85 THEN 'E2'
                WHEN e.dv_beta_derived >= 0.40 THEN 'E1'
                WHEN e.dv_beta_derived IS NOT NULL THEN 'E0'
                ELSE NULL
            END AS dominant_zone,
            ow_total.total_emp
        FROM matched_titles mt
        JOIN onet_occupations o ON o.onet_soc = mt.soc_code
        LEFT JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
        LEFT JOIN ms_ai_applicability_scores m ON o.onet_soc LIKE m.soc_code || '%'
        LEFT JOIN aei_job_exposure a ON o.onet_soc LIKE a.occ_code || '%'
        LEFT JOIN (
            SELECT onet_soc, SUM(employment) AS total_emp
            FROM oews_employment WHERE employment IS NOT NULL
            GROUP BY onet_soc
        ) ow_total ON ow_total.onet_soc = SUBSTRING(o.onet_soc, 1, 7)
        ORDER BY o.onet_soc, mt.source
        LIMIT :limit
    """), {"q": search_term, "limit": limit})

    results = [
        SearchResult(
            matched_title=row[0],
            source=row[1],
            soc_code=row[2],
            occupation_title=row[3],
            eloundou_beta=round(row[4], 4) if row[4] else None,
            ms_ai_applicability=round(row[5], 4) if row[5] else None,
            aei_exposure=round(row[6], 4) if row[6] else None,
            dominant_zone=row[7],
            total_employment=row[8],
        )
        for row in r.fetchall()
    ]

    return SearchResponse(query=q, results=results, total=len(results))
