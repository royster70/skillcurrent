"""FR-8.2 Task drift velocity calculation.

Computes linear regression of task_pct over time for each O*NET task
across AEI temporal snapshots. Produces velocity (slope), r-squared,
p-value, and temporal metadata per task.

Velocity interpretation:
  - Positive slope: task_pct increasing → AI is being used MORE for this task
    across model generations (departing trajectory)
  - Negative slope: task_pct decreasing → AI usage for this task is declining
  - Near-zero: stable usage pattern
  - NULL: insufficient data (< 2 snapshots)

This is a tracked transformation (ADR-001).
"""

import logging
from datetime import date

from scipy import stats
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.transformations import tracked_transformation

logger = logging.getLogger(__name__)

# Classification thresholds (FR-8.3, configurable defaults)
DEPARTING_VELOCITY_THRESHOLD = 0.0  # positive velocity
DEPARTING_MIN_TASK_PCT = 0.01  # minimum latest_task_pct to be considered
BELOW_THRESHOLD_LOW = 0.40  # task_pct range for "just below threshold"
BELOW_THRESHOLD_HIGH = 0.50
ENDURING_MAX_VELOCITY = 0.005  # near-zero velocity
ENDURING_MIN_IMPORTANCE = 3.5  # O*NET importance rating (1-5 scale)


def _compute_velocity(dates: list[date], values: list[float]) -> dict[str, float | None]:
    """Compute linear regression velocity over time.

    Args:
        dates: Snapshot dates (converted to ordinal for regression).
        values: task_pct values at each date.

    Returns:
        Dict with velocity, r_squared, p_value. All None if < 2 points.
    """
    if len(dates) < 2:
        return {"velocity": None, "r_squared": None, "p_value": None}

    x = [d.toordinal() for d in dates]
    y = values

    slope, _intercept, r_value, p_value, _std_err = stats.linregress(x, y)

    return {
        "velocity": float(slope),
        "r_squared": float(r_value**2),
        "p_value": float(p_value),
    }


def _classify_task(
    velocity: float | None,
    latest_task_pct: float | None,
    mean_task_pct: float | None,
    is_emerging: bool,
    avg_importance: float | None,
) -> str | None:
    """Classify a task as departing/enduring/emerging/below_threshold.

    Classification rules (FR-8.3):
    1. Emerging: task appears in onet_emerging_tasks (overrides other rules)
    2. Below threshold: latest_task_pct in 40-50% range with positive velocity
       (highest priority signal for workforce planning)
    3. Departing: positive velocity AND meaningful task_pct
    4. Enduring: low/stable velocity OR high importance with low AI usage
    5. NULL: insufficient data

    Args:
        velocity: Linear regression slope (positive = increasing AI usage).
        latest_task_pct: Most recent task_pct value.
        mean_task_pct: Average task_pct across all snapshots.
        is_emerging: Whether task appears in onet_emerging_tasks.
        avg_importance: Average O*NET importance rating for this task.
    """
    if is_emerging:
        return "emerging"

    if velocity is None or latest_task_pct is None:
        return None

    # "Just below threshold" — highest priority signal
    if (
        BELOW_THRESHOLD_LOW <= latest_task_pct <= BELOW_THRESHOLD_HIGH
        and velocity > DEPARTING_VELOCITY_THRESHOLD
    ):
        return "below_threshold"

    # Departing — positive velocity with meaningful usage
    if velocity > DEPARTING_VELOCITY_THRESHOLD and latest_task_pct > DEPARTING_MIN_TASK_PCT:
        return "departing"

    # Enduring — stable/declining velocity, especially with high importance
    if abs(velocity) <= ENDURING_MAX_VELOCITY:
        return "enduring"
    if velocity < 0:
        return "enduring"

    # If high importance but low AI usage — enduring
    if (
        avg_importance
        and avg_importance >= ENDURING_MIN_IMPORTANCE
        and (latest_task_pct or 0) < 0.1
    ):
        return "enduring"

    return None


@tracked_transformation(
    name="compute_task_drift",
    sources=[
        "aei_task_snapshots",
        "onet_emerging_tasks",
        "onet_task_statements",
        "onet_task_ratings",
    ],
    target="task_drift_metrics",
)
async def compute_task_drift(
    session: AsyncSession,
    platform: str = "claude_ai",
) -> int:
    """Compute drift velocity for all tasks with AEI temporal data.

    For each unique task_text in aei_task_snapshots:
    1. Collect (snapshot_date, task_pct) pairs across model eras
    2. Run linear regression to get velocity
    3. Classify based on velocity + importance + emerging status
    4. Insert into task_drift_metrics

    Returns:
        Number of task_drift_metrics rows created.
    """
    logger.info("Starting drift calculation for platform=%s...", platform)

    # Step 1: Fetch all task snapshots grouped by task_text
    snapshots_result = await session.execute(
        text(
            """
        SELECT task_text, snapshot_date, task_pct
        FROM aei_task_snapshots
        WHERE platform = :platform AND task_pct IS NOT NULL
        ORDER BY task_text, snapshot_date
    """
        ),
        {"platform": platform},
    )

    # Group by task_text
    task_snapshots: dict[str, list[tuple[date, float]]] = {}
    for row in snapshots_result.fetchall():
        task_text = row[0]
        if task_text not in task_snapshots:
            task_snapshots[task_text] = []
        task_snapshots[task_text].append((row[1], float(row[2])))

    logger.info("Found %d unique tasks with snapshot data", len(task_snapshots))

    # Step 2: Fetch emerging task texts (for classification)
    emerging_result = await session.execute(text("SELECT LOWER(task) FROM onet_emerging_tasks"))
    emerging_tasks = {row[0] for row in emerging_result.fetchall()}
    logger.info("Found %d emerging tasks", len(emerging_tasks))

    # Step 3: Fetch average importance per task text from O*NET
    importance_result = await session.execute(
        text(
            """
        SELECT LOWER(ts.task), AVG(tr.data_value)
        FROM onet_task_statements ts
        JOIN onet_task_ratings tr ON tr.onet_soc = ts.onet_soc
            AND tr.task_id = ts.task_id AND tr.scale_id = 'IM'
        GROUP BY LOWER(ts.task)
    """
        )
    )
    task_importance: dict[str, float] = {
        row[0]: float(row[1]) for row in importance_result.fetchall()
    }
    logger.info("Found importance ratings for %d tasks", len(task_importance))

    # Step 4: Compute velocity and classify for each task
    rows_to_insert = []

    for task_text, points in task_snapshots.items():
        dates = [p[0] for p in points]
        values = [p[1] for p in points]

        # Velocity via linregress
        vel = _compute_velocity(dates, values)

        # Temporal metadata
        first_seen = min(dates)
        latest = max(dates)
        latest_pct = values[-1]  # last by date (already sorted)
        peak_pct = max(values)
        mean_pct = sum(values) / len(values)

        # Classification
        is_emerging = task_text.lower() in emerging_tasks
        avg_imp = task_importance.get(task_text.lower())

        classification = _classify_task(
            velocity=vel["velocity"],
            latest_task_pct=latest_pct,
            mean_task_pct=mean_pct,
            is_emerging=is_emerging,
            avg_importance=avg_imp,
        )

        rows_to_insert.append(
            {
                "task_text": task_text,
                "first_seen_date": first_seen,
                "latest_date": latest,
                "snapshot_count": len(points),
                "velocity": vel["velocity"],
                "r_squared": vel["r_squared"],
                "p_value": vel["p_value"],
                "classification": classification,
                "latest_task_pct": latest_pct,
                "peak_task_pct": peak_pct,
                "mean_task_pct": mean_pct,
                "platform": platform,
            }
        )

    # Step 5: Bulk insert
    if rows_to_insert:
        columns = list(rows_to_insert[0].keys())
        col_list = ", ".join(columns)
        param_list = ", ".join(f":{c}" for c in columns)
        sql = text(f"INSERT INTO task_drift_metrics ({col_list}) VALUES ({param_list})")

        batch_size = 5000
        for i in range(0, len(rows_to_insert), batch_size):
            await session.execute(sql, rows_to_insert[i : i + batch_size])

    logger.info(
        "Drift calculation complete: %d tasks processed, %d classified",
        len(rows_to_insert),
        sum(1 for r in rows_to_insert if r["classification"] is not None),
    )

    return len(rows_to_insert)
