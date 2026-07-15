"""Drift endpoints — task classification and velocity views."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import DriftListResponse, DriftSummaryResponse, DriftTaskSummary
from app.api.v1.soc_groups import families_for_soc_codes
from app.db.session import get_db

router = APIRouter(prefix="/drift", tags=["drift"])


@router.get("/summary", response_model=DriftSummaryResponse)
async def get_drift_summary(
    db: AsyncSession = Depends(get_db),
) -> DriftSummaryResponse:
    """Get drift classification distribution and summary stats."""
    r = await db.execute(
        text(
            """
        SELECT
            COUNT(*) AS total,
            COUNT(classification) AS classified,
            SUM(CASE WHEN classification = 'departing' THEN 1 ELSE 0 END),
            SUM(CASE WHEN classification = 'enduring' THEN 1 ELSE 0 END),
            SUM(CASE WHEN classification = 'below_threshold' THEN 1 ELSE 0 END),
            SUM(CASE WHEN classification = 'emerging' THEN 1 ELSE 0 END),
            SUM(CASE WHEN classification IS NULL THEN 1 ELSE 0 END),
            AVG(CASE WHEN classification = 'departing' THEN velocity END),
            AVG(CASE WHEN classification = 'enduring' THEN velocity END)
        FROM task_drift_metrics
    """
        )
    )
    row = r.one()
    return DriftSummaryResponse(
        total_tasks=row[0],
        classified_tasks=row[1],
        departing=row[2],
        enduring=row[3],
        below_threshold=row[4],
        emerging=row[5],
        unclassified=row[6],
        avg_velocity_departing=round(row[7], 6) if row[7] else None,
        avg_velocity_enduring=round(row[8], 6) if row[8] else None,
    )


@router.get("/departing", response_model=DriftListResponse)
async def get_departing_tasks(
    min_snapshots: int = Query(2, ge=1, description="Minimum snapshot count"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> DriftListResponse:
    """Get departing tasks ranked by velocity (fastest growing AI usage)."""
    return await _get_drift_tasks(db, "departing", min_snapshots, page, page_size)


@router.get("/below-threshold", response_model=DriftListResponse)
async def get_below_threshold_tasks(
    db: AsyncSession = Depends(get_db),
) -> DriftListResponse:
    """Get below-threshold tasks — highest priority workforce planning signal.

    These tasks are at 40-50% AI usage with positive velocity,
    meaning they will likely cross the automation threshold in the
    next 1-2 model generations.
    """
    return await _get_drift_tasks(db, "below_threshold", 2, 1, 100)


@router.get("/enduring", response_model=DriftListResponse)
async def get_enduring_tasks(
    min_snapshots: int = Query(2, ge=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> DriftListResponse:
    """Get enduring tasks — stable or declining AI usage."""
    return await _get_drift_tasks(db, "enduring", min_snapshots, page, page_size)


async def _get_drift_tasks(
    db: AsyncSession,
    classification: str,
    min_snapshots: int,
    page: int,
    page_size: int,
) -> DriftListResponse:
    """Shared query logic for drift task lists."""
    params = {
        "classification": classification,
        "min_snapshots": min_snapshots,
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }

    count_r = await db.execute(
        text(
            """
        SELECT COUNT(*) FROM task_drift_metrics
        WHERE classification = :classification
          AND snapshot_count >= :min_snapshots
    """
        ),
        params,
    )
    total = count_r.scalar() or 0

    order_col = (
        "velocity" if classification in ("departing", "below_threshold") else "latest_task_pct"
    )

    r = await db.execute(
        text(
            f"""
        SELECT task_text, velocity, r_squared, latest_task_pct,
               peak_task_pct, classification, snapshot_count
        FROM task_drift_metrics
        WHERE classification = :classification
          AND snapshot_count >= :min_snapshots
        ORDER BY {order_col} DESC
        LIMIT :limit OFFSET :offset
    """
        ),
        params,
    )
    rows = r.fetchall()

    families_by_text = await _families_by_task_text(db, [row[0] for row in rows])

    tasks = [
        DriftTaskSummary(
            task_text=row[0],
            velocity=round(row[1], 6) if row[1] else None,
            r_squared=round(row[2], 3) if row[2] else None,
            latest_task_pct=round(row[3], 4) if row[3] else None,
            peak_task_pct=round(row[4], 4) if row[4] else None,
            classification=row[5],
            snapshot_count=row[6],
            families=families_by_text.get((row[0] or "").lower()),
        )
        for row in rows
    ]

    return DriftListResponse(tasks=tasks, total=total, page=page, page_size=page_size)


async def _families_by_task_text(db: AsyncSession, task_texts: list[str]) -> dict[str, list[str]]:
    """Map each task_text (lowercased) to its SOC major-group names.

    The AEI drift task text IS its O*NET task text (case-insensitively;
    task_drift_metrics stores it lowercased). `aei_task_snapshots.onet_soc_codes`
    is unpopulated in the loaded data, so O*NET's own task → onet_soc is the live
    bridge — ~83% of drift tasks match. One grouped scan for the whole page (not
    a per-row correlated subquery), merged in Python; there is no functional
    index on lower(task), so a single pass is the cheap shape.
    """
    texts = [t.lower() for t in task_texts if t]
    if not texts:
        return {}
    r = await db.execute(
        text(
            """
        SELECT lower(o.task) AS lt, ARRAY_AGG(DISTINCT LEFT(o.onet_soc, 2)) AS codes
        FROM onet_task_statements o
        WHERE lower(o.task) = ANY(:texts)
        GROUP BY lower(o.task)
    """
        ),
        {"texts": texts},
    )
    out: dict[str, list[str]] = {}
    for lt, codes in r.fetchall():
        fam = families_for_soc_codes(codes)
        if fam:
            out[lt] = fam
    return out
