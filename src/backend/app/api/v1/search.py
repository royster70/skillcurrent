"""Search endpoint — find occupations by job title text.

Uses a two-pass search strategy:
1. Exact substring match (ILIKE) — fast, handles precise queries
2. Trigram similarity (pg_trgm) — fuzzy, handles typos and partial matches

Results are ranked by similarity score so the best matches appear first.
"""

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
    similarity: float | None = None
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

    Searches 65,496 titles using a two-pass strategy:
    1. Substring match (ILIKE %query%) for exact phrases
    2. Trigram similarity for fuzzy/typo-tolerant matching

    Results are deduplicated by occupation and ranked by best match.
    Returns occupations with three-tier scores and zone classification.
    """
    search_term = f"%{q}%"

    r = await db.execute(text("""
        WITH matched_titles AS (
            -- Pass 1: Substring match (highest priority)
            SELECT reported_job_title AS matched_title,
                   'sample' AS source,
                   onet_soc AS soc_code,
                   1.0 AS match_score
            FROM onet_sample_titles
            WHERE reported_job_title ILIKE :substring

            UNION ALL

            SELECT alternate_title AS matched_title,
                   'alternate' AS source,
                   onet_soc AS soc_code,
                   1.0 AS match_score
            FROM onet_alternate_titles
            WHERE alternate_title ILIKE :substring

            UNION ALL

            -- Pass 2: Trigram fuzzy match (catches typos, word reordering)
            SELECT reported_job_title AS matched_title,
                   'sample' AS source,
                   onet_soc AS soc_code,
                   similarity(LOWER(reported_job_title), LOWER(:raw_query)) AS match_score
            FROM onet_sample_titles
            WHERE similarity(LOWER(reported_job_title), LOWER(:raw_query)) > 0.2
              AND reported_job_title NOT ILIKE :substring

            UNION ALL

            SELECT alternate_title AS matched_title,
                   'alternate' AS source,
                   onet_soc AS soc_code,
                   similarity(LOWER(alternate_title), LOWER(:raw_query)) AS match_score
            FROM onet_alternate_titles
            WHERE similarity(LOWER(alternate_title), LOWER(:raw_query)) > 0.2
              AND alternate_title NOT ILIKE :substring
        ),
        -- Deduplicate: keep best match per occupation
        best_match AS (
            SELECT DISTINCT ON (soc_code)
                matched_title, source, soc_code, match_score
            FROM matched_titles
            ORDER BY soc_code, match_score DESC
        )
        SELECT
            bm.matched_title,
            bm.source,
            o.onet_soc,
            o.title AS occupation_title,
            bm.match_score,
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
        FROM best_match bm
        JOIN onet_occupations o ON o.onet_soc = bm.soc_code
        LEFT JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
        LEFT JOIN ms_ai_applicability_scores m ON o.onet_soc LIKE m.soc_code || '%'
        LEFT JOIN aei_job_exposure a ON o.onet_soc LIKE a.occ_code || '%'
        LEFT JOIN (
            SELECT onet_soc, SUM(employment) AS total_emp
            FROM oews_employment WHERE employment IS NOT NULL
            GROUP BY onet_soc
        ) ow_total ON ow_total.onet_soc = SUBSTRING(o.onet_soc, 1, 7)
        ORDER BY bm.match_score DESC, o.title
        LIMIT :limit
    """), {"substring": search_term, "raw_query": q, "limit": limit})

    results = [
        SearchResult(
            matched_title=row[0],
            source=row[1],
            soc_code=row[2],
            occupation_title=row[3],
            similarity=round(row[4], 3) if row[4] else None,
            eloundou_beta=round(row[5], 4) if row[5] else None,
            ms_ai_applicability=round(row[6], 4) if row[6] else None,
            aei_exposure=round(row[7], 4) if row[7] else None,
            dominant_zone=row[8],
            total_employment=row[9],
        )
        for row in r.fetchall()
    ]

    return SearchResponse(query=q, results=results, total=len(results))
