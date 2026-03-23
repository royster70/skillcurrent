"""Eloundou DWA-level score derivation (Strategy A).

Distributes occupation-level E1/E2/E0/Beta scores across DWAs, weighted
by O*NET task importance ratings. This is a one-time derivation that
establishes the theoretical baseline for task-level AI exposure.

Join path:
  eloundou_occ_scores (923 occupations)
    → onet_tasks_to_dwas (task_id → dwa_id per occupation)
    → onet_task_ratings (importance weight per task, scale_id='IM')
    → onet_dwa_references (dwa_title)
    → eloundou_dwa_scores (derived output)

For each (occupation, DWA) pair:
  1. Find all tasks linking this DWA to this occupation
  2. Sum their importance weights
  3. Compute weight = sum_importance / total_importance_for_occupation
  4. Derived score = occupation_score × weight

This is a tracked transformation (ADR-001).
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.transformations import tracked_transformation

logger = logging.getLogger(__name__)


@tracked_transformation(
    name="derive_eloundou_dwa_scores",
    sources=["eloundou_occ_scores", "onet_tasks_to_dwas", "onet_task_ratings", "onet_dwa_references"],
    target="eloundou_dwa_scores",
)
async def derive_eloundou_dwa_scores(
    session: AsyncSession,
    dataset_version: str = "2024_science",
    onet_version: str = "28.1",
) -> int:
    """Derive DWA-level exposure scores from occupation-level Eloundou data.

    Returns:
        Number of DWA-level rows created.
    """
    logger.info("Starting Eloundou DWA derivation (Strategy A)...")

    # The derivation is a single SQL INSERT...SELECT that:
    # 1. Joins eloundou occupation scores to tasks-to-DWAs mapping
    # 2. Joins task ratings for importance weights (scale_id='IM')
    # 3. Computes normalised importance weight per (occupation, DWA)
    # 4. Multiplies occupation scores by weight to get DWA scores
    # 5. Joins DWA reference for titles

    derivation_sql = text("""
        INSERT INTO eloundou_dwa_scores (
            onet_soc, dwa_id, dwa_title,
            dv_e1_alpha, dv_e2_beta, dv_e0_gamma, dv_beta_derived,
            human_e1_alpha, human_e2_beta, human_e0_gamma, human_beta_derived,
            importance_weight, task_count, source,
            dataset_version, onet_version
        )
        SELECT
            agg.onet_soc,
            agg.dwa_id,
            dwa.dwa_title,
            -- GPT-4 derived: occupation score × normalised importance weight
            e.dv_e1_alpha * agg.norm_weight AS dv_e1_alpha,
            e.dv_e2_beta * agg.norm_weight AS dv_e2_beta,
            e.dv_e0_gamma * agg.norm_weight AS dv_e0_gamma,
            e.dv_beta_derived * agg.norm_weight AS dv_beta_derived,
            -- Human derived
            e.human_e1_alpha * agg.norm_weight AS human_e1_alpha,
            e.human_e2_beta * agg.norm_weight AS human_e2_beta,
            e.human_e0_gamma * agg.norm_weight AS human_e0_gamma,
            e.human_beta_derived * agg.norm_weight AS human_beta_derived,
            -- Metadata
            agg.norm_weight AS importance_weight,
            agg.task_count,
            'derived' AS source,
            :dataset_version AS dataset_version,
            :onet_version AS onet_version
        FROM (
            -- Aggregate importance per (occupation, DWA)
            -- Weight = sum of importance for tasks linking to this DWA
            -- Normalised by total importance across ALL DWAs for the occupation
            SELECT
                td.onet_soc,
                td.dwa_id,
                SUM(tr.data_value) AS dwa_importance,
                COUNT(DISTINCT td.task_id) AS task_count,
                SUM(tr.data_value) / SUM(SUM(tr.data_value)) OVER (PARTITION BY td.onet_soc) AS norm_weight
            FROM onet_tasks_to_dwas td
            JOIN onet_task_ratings tr
                ON tr.onet_soc = td.onet_soc
                AND tr.task_id = td.task_id
                AND tr.scale_id = 'IM'
            GROUP BY td.onet_soc, td.dwa_id
        ) agg
        JOIN eloundou_occ_scores e ON e.onet_soc = agg.onet_soc
        LEFT JOIN onet_dwa_references dwa ON dwa.dwa_id = agg.dwa_id
        ORDER BY agg.onet_soc, agg.dwa_id
    """)

    result = await session.execute(
        derivation_sql,
        {"dataset_version": dataset_version, "onet_version": onet_version},
    )

    # Get row count
    count_result = await session.execute(
        text("SELECT COUNT(*) FROM eloundou_dwa_scores WHERE source = 'derived'")
    )
    rows_created = count_result.scalar() or 0

    logger.info("Eloundou DWA derivation complete: %d rows created", rows_created)

    return rows_created
