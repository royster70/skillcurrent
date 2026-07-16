"""Bearings — the high-ground reading for an occupation.

Answers the "what now?" that follows the diagnosis: which of this role's
work activities stay dry (the high ground — distinctly human skills worth
deepening), and which OTHER, drier occupations share those same dry
activities (the direction the high ground leads).

Method: `eloundou_dwa_scores` is occupation × DWA grain with a derived β and
an importance weight per activity (Strategy A distribution of the Eloundou
occupation scores through the task→DWA map). High ground = this role's DWAs
with β below the insulated threshold, ranked by importance. Adjacency =
occupations where those SAME DWAs are also dry, scored by
shared_importance × (source β − target β): overlap × how much drier the
move actually is — both factors transparent, nothing blended or hidden.
An already-dry role naturally produces near-zero scores (nowhere drier to
go), which the UI reads as "hold the high ground".
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import AdjacentRole, BearingsResponse, HighGroundSkill
from app.db.session import get_db

router = APIRouter(prefix="/occupations", tags=["bearings"])

# Zone boundary for "dry" (E0 / insulated). Matches the platform default
# (CLAUDE.md: configurable thresholds; E0 is β < 0.40).
DRY_THRESHOLD = 0.40

# A move must be meaningfully drier to count as direction, not noise.
MIN_DRIER_BY = 0.05

# Fewer shared dry activities than this is a fluke, not a bridge.
MIN_SHARED = 3


@router.get("/{soc_code}/bearings", response_model=BearingsResponse)
async def get_bearings(
    soc_code: str,
    db: AsyncSession = Depends(get_db),
) -> BearingsResponse:
    """High-ground skills of a role, and the drier roles they lead to."""
    r = await db.execute(
        text(
            """
        SELECT o.title, e.dv_beta_derived
        FROM onet_occupations o
        LEFT JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
        WHERE o.onet_soc = :soc
    """
        ),
        {"soc": soc_code},
    )
    row = r.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Occupation {soc_code} not found")
    title, source_beta = row[0], row[1]

    high_ground = await _high_ground(db, soc_code)
    adjacent = await _adjacent_roles(db, soc_code, source_beta) if source_beta is not None else []

    return BearingsResponse(
        soc_code=soc_code,
        title=title,
        source_beta=round(source_beta, 4) if source_beta is not None else None,
        high_ground=high_ground,
        adjacent=adjacent,
    )


async def _high_ground(db: AsyncSession, soc: str) -> list[HighGroundSkill]:
    """This role's dry work activities, most important first."""
    r = await db.execute(
        text(
            """
        SELECT dwa_id, dwa_title, dv_beta_derived, importance_weight
        FROM eloundou_dwa_scores
        WHERE onet_soc = :soc
          AND dv_beta_derived IS NOT NULL
          AND dv_beta_derived < :dry
        ORDER BY importance_weight DESC NULLS LAST, dv_beta_derived ASC
        LIMIT 8
    """
        ),
        {"soc": soc, "dry": DRY_THRESHOLD},
    )
    return [
        HighGroundSkill(
            dwa_id=row[0],
            dwa_title=row[1],
            beta=round(row[2], 4),
            importance_weight=round(row[3], 4) if row[3] is not None else None,
        )
        for row in r.fetchall()
    ]


async def _adjacent_roles(db: AsyncSession, soc: str, source_beta: float) -> list[AdjacentRole]:
    """Drier occupations sharing this role's dry DWAs, scored by
    shared importance × dryness gain."""
    r = await db.execute(
        text(
            """
        WITH dry AS (
            SELECT dwa_id
            FROM eloundou_dwa_scores
            WHERE onet_soc = :soc AND dv_beta_derived < :dry
        ),
        cand AS (
            SELECT e.onet_soc,
                   COUNT(*) AS shared_count,
                   SUM(e.importance_weight) AS shared_importance,
                   (ARRAY_AGG(e.dwa_title ORDER BY e.importance_weight DESC))[1:3]
                       AS shared_titles
            FROM eloundou_dwa_scores e
            JOIN dry d ON d.dwa_id = e.dwa_id
            WHERE e.onet_soc <> :soc AND e.dv_beta_derived < :dry
            GROUP BY e.onet_soc
            HAVING COUNT(*) >= :min_shared
        )
        SELECT c.onet_soc,
               o.title,
               occ.dv_beta_derived AS target_beta,
               c.shared_count,
               c.shared_titles,
               c.shared_importance * (:src_beta - occ.dv_beta_derived) AS score,
               ow.total_emp
        FROM cand c
        JOIN onet_occupations o ON o.onet_soc = c.onet_soc
        JOIN eloundou_occ_scores occ ON occ.onet_soc = c.onet_soc
        LEFT JOIN (
            SELECT onet_soc, SUM(employment) AS total_emp
            FROM oews_employment WHERE employment IS NOT NULL
            GROUP BY onet_soc
        ) ow ON ow.onet_soc = SUBSTRING(c.onet_soc, 1, 7)
        WHERE occ.dv_beta_derived < :src_beta - :min_drier
        ORDER BY score DESC
        LIMIT 6
    """
        ),
        {
            "soc": soc,
            "dry": DRY_THRESHOLD,
            "src_beta": source_beta,
            "min_shared": MIN_SHARED,
            "min_drier": MIN_DRIER_BY,
        },
    )
    return [
        AdjacentRole(
            soc_code=row[0],
            title=row[1],
            beta=round(row[2], 4),
            drier_by=round(source_beta - row[2], 4),
            shared_count=row[3],
            shared_titles=list(row[4] or []),
            total_employment=float(row[6]) if row[6] is not None else None,
            score=round(row[5], 4),
        )
        for row in r.fetchall()
    ]
