"""GDPval benchmark endpoints — real-world knowledge task evaluations."""

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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


class WaterlineEraScore(BaseModel):
    model_era: str
    avg_score: float
    benchmark_count: int
    measurement_date: str | None


class WaterlineBenchmark(BaseModel):
    benchmark: str
    is_math: bool | None
    is_coding: bool | None
    eras: list[WaterlineEraScore]
    velocity: float | None  # average score delta per era step (None if only 1 era)


class WaterlineResponse(BaseModel):
    total_eras: int
    total_benchmarks: int
    eras_in_order: list[str]  # sorted by earliest measurement_date
    by_benchmark: list[WaterlineBenchmark]
    overall_velocity: float | None  # mean velocity across all benchmarks
    source: str


@router.get("/summary", response_model=GDPvalSummaryResponse)
async def gdpval_summary(db: AsyncSession = Depends(get_db)) -> GDPvalSummaryResponse:
    """Overview of GDPval benchmark coverage."""
    stats = await db.execute(
        text(
            """
        SELECT
            COUNT(*) AS total_tasks,
            COUNT(DISTINCT onet_soc) AS total_occupations,
            SUM(rubric_item_count) AS total_rubric_items
        FROM gdpval_tasks
    """
        )
    )
    row = stats.one()

    sectors = await db.execute(text("SELECT DISTINCT sector FROM gdpval_tasks ORDER BY sector"))

    occs = await db.execute(
        text(
            """
        SELECT onet_soc, occupation_title, sector, COUNT(*) AS task_count
        FROM gdpval_tasks
        WHERE onet_soc IS NOT NULL
        GROUP BY onet_soc, occupation_title, sector
        ORDER BY occupation_title
    """
        )
    )

    return GDPvalSummaryResponse(
        total_tasks=row[0],
        total_occupations=row[1],
        total_rubric_items=row[2] or 0,
        sectors=[r[0] for r in sectors.fetchall()],
        occupations=[
            GDPvalOccupationSummary(
                soc_code=r[0],
                title=r[1],
                sector=r[2],
                task_count=r[3],
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
        text(
            """
            SELECT task_id, occupation_title, sector, prompt,
                   rubric_item_count, max_score, min_score,
                   reference_file_count, deliverable_file_count
            FROM gdpval_tasks
            WHERE onet_soc = :soc_code
            ORDER BY task_id
        """
        ),
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
        text(
            """
            SELECT task_id, criterion, score, required, tags
            FROM gdpval_rubric_items
            WHERE task_id = ANY(:task_ids)
            ORDER BY task_id, id
        """
        ),
        {"task_ids": task_ids},
    )
    rubric_by_task: dict[str, list[GDPvalRubricItem]] = {}
    for r in rubrics.fetchall():
        tags = json.loads(r[4]) if r[4] else None
        item = GDPvalRubricItem(
            criterion=r[1],
            score=r[2],
            required=r[3],
            tags=tags,
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


@router.get("/waterline", response_model=WaterlineResponse)
async def gdpval_waterline(
    db: AsyncSession = Depends(get_db),
) -> WaterlineResponse:
    """AI capability waterline velocity from Epoch AI ECI benchmark data.

    Returns average benchmark scores per model era (sorted chronologically) and
    the velocity (score delta per era step) for each benchmark.  This is the
    'rising waterline' signal — how fast AI capability is compounding across
    model generations.

    Source: gptval_benchmarks (Epoch AI Capabilities Index, CC-BY).
    """
    # Check data availability
    count_result = await db.execute(text("SELECT COUNT(*) FROM gptval_benchmarks"))
    row_count = count_result.scalar_one()
    if row_count == 0:
        raise HTTPException(
            status_code=404,
            detail=(
                "No waterline data available. "
                "Run: python -m scripts.ingest_epoch_eci to load Epoch AI ECI data."
            ),
        )

    # Get era ordering by earliest measurement date
    era_order_result = await db.execute(
        text(
            """
        SELECT model_era, MIN(measurement_date) AS earliest_date
        FROM gptval_benchmarks
        WHERE measurement_date IS NOT NULL
        GROUP BY model_era
        ORDER BY earliest_date
    """
        )
    )
    era_rows = era_order_result.fetchall()
    eras_in_order = [r[0] for r in era_rows]

    # Get per-benchmark × per-era aggregate scores
    scores_result = await db.execute(
        text(
            """
        SELECT
            benchmark,
            model_era,
            ROUND(AVG(score)::numeric, 4)   AS avg_score,
            COUNT(*)                         AS benchmark_count,
            is_math,
            is_coding,
            MIN(measurement_date)            AS earliest_date
        FROM gptval_benchmarks
        GROUP BY benchmark, model_era, is_math, is_coding
        ORDER BY benchmark, MIN(measurement_date) NULLS LAST
    """
        )
    )
    score_rows = scores_result.fetchall()

    # Organise into benchmark → era map
    bench_data: dict[str, Any] = {}
    for row in score_rows:
        bname = row[0]
        if bname not in bench_data:
            bench_data[bname] = {
                "is_math": row[4],
                "is_coding": row[5],
                "eras": {},
            }
        bench_data[bname]["eras"][row[1]] = {
            "avg_score": float(row[2]),
            "benchmark_count": int(row[3]),
            "measurement_date": str(row[6]) if row[6] else None,
        }

    # Build response: compute velocity for each benchmark
    benchmarks_out: list[WaterlineBenchmark] = []
    all_velocities: list[float] = []

    for bname, binfo in bench_data.items():
        era_scores = []
        for era in eras_in_order:
            if era in binfo["eras"]:
                e = binfo["eras"][era]
                era_scores.append(
                    WaterlineEraScore(
                        model_era=era,
                        avg_score=e["avg_score"],
                        benchmark_count=e["benchmark_count"],
                        measurement_date=e["measurement_date"],
                    )
                )

        # Velocity = mean delta between consecutive era scores for this benchmark
        velocity: float | None = None
        if len(era_scores) >= 2:
            deltas = [
                era_scores[i + 1].avg_score - era_scores[i].avg_score
                for i in range(len(era_scores) - 1)
            ]
            velocity = round(sum(deltas) / len(deltas), 4)
            all_velocities.append(velocity)

        benchmarks_out.append(
            WaterlineBenchmark(
                benchmark=bname,
                is_math=binfo["is_math"],
                is_coding=binfo["is_coding"],
                eras=era_scores,
                velocity=velocity,
            )
        )

    overall_velocity = (
        round(sum(all_velocities) / len(all_velocities), 4) if all_velocities else None
    )

    # Sort benchmarks by descending velocity (highest rate of improvement first)
    benchmarks_out.sort(
        key=lambda b: b.velocity if b.velocity is not None else -999,
        reverse=True,
    )

    return WaterlineResponse(
        total_eras=len(eras_in_order),
        total_benchmarks=len(benchmarks_out),
        eras_in_order=eras_in_order,
        by_benchmark=benchmarks_out,
        overall_velocity=overall_velocity,
        source="Epoch AI Capabilities Index (ECI) — epoch.ai/data/eci_benchmarks.csv",
    )
