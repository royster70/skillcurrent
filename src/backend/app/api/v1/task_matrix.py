"""Task positioning matrix — tasks plotted by automation potential vs human value.

Each task for an occupation is positioned on a 2×2 matrix:
  X-axis: Automation potential (Eloundou DWA Beta, Microsoft IWA metrics)
  Y-axis: Human value add (O*NET importance rating, 1-5 scale)

Zone classification:
  Insulated (top-left): High importance + low automation
  Augmented (top-right): High importance + high automation (human-in-the-loop)
  Disrupted (bottom-right): Low importance + high automation (automate away)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(tags=["occupations"])


class EraSnapshot(BaseModel):
    model_era: str
    task_pct: float
    automation_potential: float  # normalised for X-axis positioning
    automation_pct: float | None = None  # % of conversations where AI fully automated
    augmentation_pct: float | None = None  # % with human-in-the-loop


class TaskMatrixPoint(BaseModel):
    task_id: int
    task_text: str
    importance: float | None = None  # Y-axis: O*NET importance (1-5)
    automation_potential: float | None = None  # X-axis: derived from exposure scores (current)
    eloundou_dwa_beta: float | None = None
    drift_velocity: float | None = None
    drift_classification: str | None = None
    aei_penetration: float | None = None
    quadrant: str | None = None  # insulated, augmented, disrupted, routine
    era_snapshots: list[EraSnapshot] = []  # temporal positions per model era


class TaskMatrixResponse(BaseModel):
    soc_code: str
    occupation_title: str
    tasks: list[TaskMatrixPoint]
    total_tasks: int
    quadrant_counts: dict[str, int]
    available_eras: list[str] = []
    gdpval_benchmark_count: int = 0


@router.get("/occupations/{soc_code}/matrix", response_model=TaskMatrixResponse)
async def get_task_matrix(
    soc_code: str,
    db: AsyncSession = Depends(get_db),
) -> TaskMatrixResponse:
    """Get task positioning matrix data for an occupation.

    Each task has:
    - importance (Y): O*NET importance rating (IM scale, 1-5)
    - automation_potential (X): best available exposure score
      (Eloundou DWA Beta via task-to-DWA mapping, or Microsoft IWA metrics)
    - drift signals from AEI temporal analysis
    """
    # Resolve SOC code
    r = await db.execute(text("""
        SELECT onet_soc, title FROM onet_occupations
        WHERE onet_soc = :soc OR onet_soc LIKE :prefix || '%'
        ORDER BY onet_soc LIMIT 1
    """), {"soc": soc_code, "prefix": soc_code})
    occ = r.fetchone()
    if not occ:
        raise HTTPException(status_code=404, detail=f"Occupation {soc_code} not found")

    onet_soc = occ[0]

    r = await db.execute(text("""
        SELECT
            ts.task_id,
            ts.task,
            -- Y-axis: O*NET importance rating (IM scale)
            tr.data_value AS importance,
            -- X-axis: Eloundou DWA Beta (averaged across DWAs linked to this task)
            dwa_scores.avg_dwa_beta,
            -- Drift signals
            tdm.velocity AS drift_velocity,
            tdm.classification AS drift_classification,
            -- AEI task penetration
            atp.penetration AS aei_penetration
        FROM onet_task_statements ts
        -- Importance rating
        LEFT JOIN onet_task_ratings tr
            ON tr.onet_soc = ts.onet_soc AND tr.task_id = ts.task_id AND tr.scale_id = 'IM'
        -- Eloundou DWA Beta via task-to-DWA mapping
        LEFT JOIN LATERAL (
            SELECT AVG(eds.dv_beta_derived) AS avg_dwa_beta
            FROM onet_tasks_to_dwas td
            JOIN eloundou_dwa_scores eds ON eds.onet_soc = td.onet_soc AND eds.dwa_id = td.dwa_id
            WHERE td.onet_soc = ts.onet_soc AND td.task_id = ts.task_id
        ) dwa_scores ON TRUE
        -- Drift from task_drift_metrics (join on task text)
        LEFT JOIN task_drift_metrics tdm ON LOWER(tdm.task_text) = LOWER(ts.task)
        -- AEI penetration
        LEFT JOIN aei_task_penetration atp ON LOWER(atp.task) = LOWER(ts.task)
        WHERE ts.onet_soc = :soc
        ORDER BY tr.data_value DESC NULLS LAST
    """), {"soc": onet_soc})

    # Fetch AEI temporal snapshots for all tasks in this occupation
    era_r = await db.execute(text("""
        SELECT LOWER(task_text), model_era, task_pct, automation_pct, augmentation_pct
        FROM aei_task_snapshots
        WHERE platform = 'claude_ai' AND task_pct IS NOT NULL
          AND LOWER(task_text) IN (
              SELECT LOWER(task) FROM onet_task_statements WHERE onet_soc = :soc
          )
        ORDER BY snapshot_date
    """), {"soc": onet_soc})

    # Build era lookup: task_text -> [{model_era, task_pct}]
    era_data: dict[str, list[EraSnapshot]] = {}
    all_eras: set[str] = set()
    for era_row in era_r.fetchall():
        task_lower = era_row[0]
        era = era_row[1]
        pct = float(era_row[2])
        auto_pct = round(float(era_row[3]), 4) if era_row[3] is not None else None
        aug_pct = round(float(era_row[4]), 4) if era_row[4] is not None else None
        all_eras.add(era)
        if task_lower not in era_data:
            era_data[task_lower] = []
        era_data[task_lower].append(EraSnapshot(
            model_era=era,
            task_pct=round(pct, 4),
            automation_potential=round(min(pct / 5.0, 1.0), 3),  # normalise: 5% -> 1.0
            automation_pct=auto_pct,
            augmentation_pct=aug_pct,
        ))

    tasks = []
    quadrant_counts = {"insulated": 0, "augmented": 0, "disrupted": 0, "routine": 0}

    for row in r.fetchall():
        importance = float(row[2]) if row[2] is not None else None
        dwa_beta = float(row[3]) if row[3] is not None else None

        # Determine automation potential (normalise DWA beta to 0-1 range)
        auto_potential = None
        if dwa_beta is not None:
            auto_potential = min(dwa_beta * 10, 1.0)

        # Determine quadrant
        quadrant = None
        if importance is not None and auto_potential is not None:
            high_importance = importance >= 3.5
            high_automation = auto_potential >= 0.4
            if high_importance and not high_automation:
                quadrant = "insulated"
            elif high_importance and high_automation:
                quadrant = "augmented"
            elif not high_importance and high_automation:
                quadrant = "disrupted"
            else:
                quadrant = "routine"
            quadrant_counts[quadrant] += 1

        # Get era snapshots for this task
        task_lower = row[1].lower() if row[1] else ""
        snapshots = era_data.get(task_lower, [])

        tasks.append(TaskMatrixPoint(
            task_id=row[0],
            task_text=row[1],
            importance=round(importance, 2) if importance else None,
            automation_potential=round(auto_potential, 3) if auto_potential else None,
            eloundou_dwa_beta=round(dwa_beta, 4) if dwa_beta else None,
            drift_velocity=round(float(row[4]), 6) if row[4] else None,
            drift_classification=row[5],
            aei_penetration=round(float(row[6]), 4) if row[6] else None,
            quadrant=quadrant,
            era_snapshots=snapshots,
        ))

    available_eras = sorted(all_eras, key=lambda e: {
        "sonnet-3.5": 1, "sonnet-3.7": 2, "sonnet-4": 3, "sonnet-4.5": 4
    }.get(e, 99))

    # GDPval benchmark count for this occupation
    gdpval_r = await db.execute(text(
        "SELECT COUNT(*) FROM gdpval_tasks WHERE onet_soc = :soc"
    ), {"soc": onet_soc})
    gdpval_count = gdpval_r.scalar() or 0

    return TaskMatrixResponse(
        soc_code=onet_soc,
        occupation_title=occ[1],
        tasks=tasks,
        total_tasks=len(tasks),
        quadrant_counts=quadrant_counts,
        available_eras=available_eras,
        gdpval_benchmark_count=gdpval_count,
    )
