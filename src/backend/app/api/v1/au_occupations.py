"""AU occupation detail — the first OSCA-keyed serving surface (GitHub #73/#78).

The AU task/exposure layer (FR-9.1/9.2) was fully ingested but had no API
surface: all AU serving was sector-grain census aggregates. This router
serves one OSCA occupation with its task-weighted exposure rollup, real ASC
core competencies, descriptor-only main tasks, ANZSCO lineage and
apportioned employment.

Invariants honoured (CLAUDE.md / ADR-010 / ADR-011):
- osca_version is returned on the payload.
- OSCA main tasks are descriptor_only — served as bare text, no exposure.
- The exposure basis is task COVERAGE (bridge cosine floored at 0.60, tier
  T2) — stated as text, never re-derived or blended with US signal counts.
- Competencies come from ONE ANZSCO key (exact 6-digit, else the 4-digit
  unit group), never averaged across codes; the source key is reported.
- SOC lineage confidences stay in the concordance — provenance only.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import (
    AnzscoLineageItem,
    AscCompetencyItem,
    AuExposureSummary,
    AuOccupationDetail,
    AuOccupationIndexEntry,
    AuOccupationIndexResponse,
)
from app.db.session import get_db

router = APIRouter(prefix="/au/occupations", tags=["au-occupations"])


@router.get("", response_model=AuOccupationIndexResponse)
async def list_au_occupations(
    db: AsyncSession = Depends(get_db),
) -> AuOccupationIndexResponse:
    """Compact index of OSCA occupations with an exposure rollup.

    ``soc_codes`` (via the 4-digit ANZSCO concordance) let SOC-keyed AU
    sector role rows discover their OSCA panel — provenance lineage only,
    concordance confidences are never merged into AU readings.
    """
    r = await db.execute(
        text(
            """
        SELECT o.osca_code, o.title, e.au_task_beta, e.coverage_pct, e.task_count,
               COALESCE(ARRAY_AGG(DISTINCT c.onet_soc)
                        FILTER (WHERE c.onet_soc IS NOT NULL), '{}') AS socs
        FROM au_occupation_exposure e
        JOIN osca_occupations o ON o.osca_code = e.osca_code
        LEFT JOIN osca_anzsco_map m ON m.osca_code = e.osca_code
        LEFT JOIN anzsco_soc_concordance c ON c.anzsco_code = SUBSTRING(m.anzsco_code, 1, 4)
        GROUP BY o.osca_code, o.title, e.au_task_beta, e.coverage_pct, e.task_count
        ORDER BY o.osca_code
    """
        )
    )
    rows = r.fetchall()
    entries = [
        AuOccupationIndexEntry(
            osca_code=row[0],
            title=row[1],
            au_task_beta=round(row[2], 4) if row[2] is not None else None,
            coverage_pct=round(row[3], 1) if row[3] is not None else None,
            task_count=row[4],
            soc_codes=list(row[5] or []),
        )
        for row in rows
    ]
    return AuOccupationIndexResponse(
        occupations=entries, total=len(entries), osca_version="2024.1.0"
    )


async def _au_exposure(db: AsyncSession, osca_code: str) -> AuExposureSummary | None:
    r = await db.execute(
        text(
            """
        SELECT e.au_task_beta, e.task_count, e.measured_task_count, e.coverage_pct,
               (SELECT COUNT(*) FROM au_task t
                WHERE t.osca_code = e.osca_code AND t.us_au_divergence) AS divergent
        FROM au_occupation_exposure e WHERE e.osca_code = :code
    """
        ),
        {"code": osca_code},
    )
    row = r.fetchone()
    if not row:
        return None
    return AuExposureSummary(
        au_task_beta=round(row[0], 4) if row[0] is not None else None,
        task_count=row[1],
        measured_task_count=row[2],
        coverage_pct=round(row[3], 1) if row[3] is not None else None,
        divergent_task_count=row[4] or 0,
    )


async def _au_competencies(
    db: AsyncSession, osca_code: str
) -> tuple[str | None, list[AscCompetencyItem]]:
    """Competencies from ONE ANZSCO key: the highest-weight mapped 6-digit
    code that has ASC rows, else its 4-digit unit group. Never averaged."""
    r = await db.execute(
        text(
            """
        SELECT c.anzsco_code
        FROM osca_anzsco_map m
        JOIN asc_core_competency c
          ON c.anzsco_code = m.anzsco_code OR c.anzsco_code = SUBSTRING(m.anzsco_code, 1, 4)
        WHERE m.osca_code = :code
        ORDER BY LENGTH(c.anzsco_code) DESC, m.weight DESC NULLS LAST, c.anzsco_code
        LIMIT 1
    """
        ),
        {"code": osca_code},
    )
    source = r.scalar()
    if source is None:
        return None, []
    r = await db.execute(
        text(
            """
        SELECT core_competency, score, proficiency_level, anchor_value
        FROM asc_core_competency WHERE anzsco_code = :anzsco
        ORDER BY score DESC NULLS LAST, core_competency
    """
        ),
        {"anzsco": source},
    )
    items = [
        AscCompetencyItem(
            name=row[0],
            score=round(row[1], 2) if row[1] is not None else None,
            proficiency_level=row[2],
            anchor_value=row[3],
        )
        for row in r.fetchall()
    ]
    return source, items


async def _au_main_tasks(db: AsyncSession, osca_code: str) -> list[str]:
    r = await db.execute(
        text("SELECT task_text FROM osca_main_tasks WHERE osca_code = :code ORDER BY id"),
        {"code": osca_code},
    )
    return [row[0] for row in r.fetchall()]


async def _au_lineage(db: AsyncSession, osca_code: str) -> list[AnzscoLineageItem]:
    """ANZSCO keys behind this OSCA code, each with its US SOC lineage (the
    concordance is 4-digit ANZSCO grain — join on the unit-group prefix)."""
    r = await db.execute(
        text(
            """
        SELECT m.anzsco_code, m.relation_type, m.weight,
               COALESCE(ARRAY_AGG(DISTINCT c.onet_soc)
                        FILTER (WHERE c.onet_soc IS NOT NULL), '{}') AS socs
        FROM osca_anzsco_map m
        LEFT JOIN anzsco_soc_concordance c
               ON c.anzsco_code = SUBSTRING(m.anzsco_code, 1, 4)
        WHERE m.osca_code = :code
        GROUP BY m.anzsco_code, m.relation_type, m.weight
        ORDER BY m.weight DESC NULLS LAST, m.anzsco_code
    """
        ),
        {"code": osca_code},
    )
    return [
        AnzscoLineageItem(
            anzsco_code=row[0],
            relation_type=row[1],
            weight=round(row[2], 4) if row[2] is not None else None,
            soc_codes=list(row[3] or []),
        )
        for row in r.fetchall()
    ]


async def _au_employment(db: AsyncSession, osca_code: str) -> float | None:
    r = await db.execute(
        text("SELECT SUM(apportioned_employment) FROM abs_employment_osca WHERE osca_code = :code"),
        {"code": osca_code},
    )
    total = r.scalar()
    return round(total, 0) if total is not None else None


@router.get("/{osca_code}", response_model=AuOccupationDetail)
async def get_au_occupation(
    osca_code: str,
    db: AsyncSession = Depends(get_db),
) -> AuOccupationDetail:
    """One OSCA occupation: exposure rollup, ASC competencies, main tasks,
    ANZSCO lineage and apportioned employment."""
    r = await db.execute(
        text(
            """
        SELECT osca_code, title, description, osca_version
        FROM osca_occupations WHERE osca_code = :code
        ORDER BY osca_version DESC LIMIT 1
    """
        ),
        {"code": osca_code},
    )
    core = r.fetchone()
    if not core:
        raise HTTPException(status_code=404, detail=f"OSCA occupation {osca_code} not found")

    exposure = await _au_exposure(db, osca_code)
    source_anzsco, competencies = await _au_competencies(db, osca_code)
    return AuOccupationDetail(
        osca_code=core[0],
        title=core[1],
        description=core[2],
        osca_version=core[3],
        exposure=exposure,
        competencies=competencies,
        competency_source_anzsco=source_anzsco,
        main_tasks=await _au_main_tasks(db, osca_code),
        anzsco_lineage=await _au_lineage(db, osca_code),
        total_employment=await _au_employment(db, osca_code),
    )
