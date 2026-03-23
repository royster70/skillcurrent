"""GDPval benchmark endpoints — real-world knowledge task evaluations."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import (
    GDPvalOccupationResponse,
    GDPvalOccupationSummary,
    GDPvalRubricItem,
    GDPvalSummaryResponse,
    GDPvalTaskDetail,
)
from app.db.session import get_db

router = APIRouter(prefix="/gdpval", tags=["gdpval"])


@router.get("/summary", response_model=GDPvalSummaryResponse)
async def gdpval_summary(db: AsyncSession = Depends(get_db)) -> GDPvalSummaryResponse:
    """Overview of GDPval benchmark coverage."""
    stats = await db.execute(text("""
        SELECT
            COUNT(*) AS total_tasks,
            COUNT(DISTINCT onet_soc) AS total_occupations,
            SUM(rubric_item_count) AS total_rubric_items
        FROM gdpval_tasks
    """))
    row = stats.fetchone()

    sectors = await db.execute(text(
        "SELECT DISTINCT sector FROM gdpval_tasks ORDER BY sector"
    ))

    occs = await db.execute(text("""
        SELECT onet_soc, occupation_title, sector, COUNT(*) AS task_count
        FROM gdpval_tasks
        WHERE onet_soc IS NOT NULL
        GROUP BY onet_soc, occupation_title, sector
        ORDER BY occupation_title
    """))

    return GDPvalSummaryResponse(
        total_tasks=row[0],
        total_occupations=row[1],
        total_rubric_items=row[2] or 0,
        sectors=[r[0] for r in sectors.fetchall()],
        occupations=[
            GDPvalOccupationSummary(
                soc_code=r[0], title=r[1], sector=r[2], task_count=r[3],
            )
            for r in occs.fetchall()
        ],
    )


@router.get(
    "/occupations/{soc_code}",
    response_model=GDPvalOccupationResponse,
)
async def gdpval_occupation(
    soc_code: str,
    db: AsyncSession = Depends(get_db),
) -> GDPvalOccupationResponse:
    """Full benchmark detail for one occupation — tasks + rubric items."""
    tasks = await db.execute(
        text("""
            SELECT task_id, occupation_title, sector, prompt,
                   rubric_item_count, max_score, min_score,
                   reference_file_count, deliverable_file_count
            FROM gdpval_tasks
            WHERE onet_soc = :soc_code
            ORDER BY task_id
        """),
        {"soc_code": soc_code},
    )
    task_rows = tasks.fetchall()

    if not task_rows:
        raise HTTPException(
            status_code=404,
            detail=f"No GDPval benchmarks for SOC {soc_code}",
        )

    # Fetch all rubric items for these tasks in one query
    task_ids = [r[0] for r in task_rows]
    rubrics = await db.execute(
        text("""
            SELECT task_id, criterion, score, required, tags
            FROM gdpval_rubric_items
            WHERE task_id = ANY(:task_ids)
            ORDER BY task_id, id
        """),
        {"task_ids": task_ids},
    )
    rubric_by_task: dict[str, list[GDPvalRubricItem]] = {}
    for r in rubrics.fetchall():
        tags = json.loads(r[4]) if r[4] else None
        item = GDPvalRubricItem(
            criterion=r[1], score=r[2], required=r[3], tags=tags,
        )
        rubric_by_task.setdefault(r[0], []).append(item)

    task_details = [
        GDPvalTaskDetail(
            task_id=r[0],
            prompt_summary=r[3][:500] if r[3] else "",
            rubric_item_count=r[4],
            max_score=r[5],
            min_score=r[6],
            reference_file_count=r[7],
            deliverable_file_count=r[8],
            rubric_items=rubric_by_task.get(r[0], []),
        )
        for r in task_rows
    ]

    return GDPvalOccupationResponse(
        soc_code=soc_code,
        occupation_title=task_rows[0][1],
        sector=task_rows[0][2],
        task_count=len(task_details),
        tasks=task_details,
    )
