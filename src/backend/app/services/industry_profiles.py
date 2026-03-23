"""FR-8.4 Industry occupation profile computation.

Joins OEWS employment data with Eloundou, Microsoft, and AEI exposure scores
to produce headcount-weighted profiles per NAICS sector × occupation.

Each row represents one occupation within one industry sector, with:
- Employment headcount and share of sector total
- Three-tier exposure scores (Eloundou theoretical, Microsoft empirical, AEI usage)
- Drift velocity and classification from FR-8.2/8.3
- Dominant exposure zone (based on Eloundou Beta thresholds)

This is a tracked transformation (ADR-001).
"""

import logging
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.transformations import tracked_transformation

logger = logging.getLogger(__name__)

# Zone thresholds (from CLAUDE.md, configurable defaults)
E2_THRESHOLD = 0.85  # automated
E1_THRESHOLD = 0.40  # augmented
# Below E1_THRESHOLD = insulated (E0)


def _classify_zone(beta: float | None) -> str | None:
    """Classify occupation into exposure zone based on Eloundou Beta."""
    if beta is None:
        return None
    if beta >= E2_THRESHOLD:
        return "E2"
    if beta >= E1_THRESHOLD:
        return "E1"
    return "E0"


@tracked_transformation(
    name="compute_industry_profiles",
    sources=["oews_employment", "eloundou_occ_scores", "ms_ai_applicability_scores",
             "aei_job_exposure", "task_drift_metrics"],
    target="industry_occupation_profiles",
)
async def compute_industry_profiles(
    session: AsyncSession,
    release_year: int = 2024,
) -> int:
    """Compute industry occupation profiles with multi-source scoring.

    Joins OEWS employment (occupation × NAICS sector) with:
    - Eloundou occupation-level Beta scores
    - Microsoft AI applicability scores
    - AEI observed exposure
    - Drift velocity and classification

    Returns:
        Number of profile rows created.
    """
    logger.info("Starting industry profile computation for release_year=%d...", release_year)

    # Clear existing profiles for this release year (idempotent recomputation)
    await session.execute(
        text("DELETE FROM industry_occupation_profiles WHERE release_year = :year"),
        {"year": release_year},
    )

    # Compute profiles via SQL join
    # OEWS uses 6-digit SOC codes; Eloundou uses 8-digit; Microsoft/AEI use 6-digit
    # For Eloundou, we take the first matching 8-digit score (most specific)
    result = await session.execute(text("""
        INSERT INTO industry_occupation_profiles (
            naics_code, naics_title, onet_soc, occupation_title,
            employment_share, headcount,
            avg_automation_pct, avg_augmentation_pct, dominant_zone,
            eloundou_beta, ms_ai_applicability, aei_exposure,
            drift_velocity, drift_classification,
            profile_date, release_year
        )
        SELECT
            ow.naics_code,
            ow.naics_title,
            ow.onet_soc,
            COALESCE(o.title, ow.onet_soc) AS occupation_title,
            -- Employment share within this sector
            CASE
                WHEN sector_total.total_emp > 0
                THEN ow.employment::FLOAT / sector_total.total_emp
                ELSE NULL
            END AS employment_share,
            ow.employment AS headcount,
            -- AEI automation/augmentation (from task snapshots, latest era)
            aei_auto.avg_automation AS avg_automation_pct,
            aei_auto.avg_augmentation AS avg_augmentation_pct,
            -- Zone classification from Eloundou Beta
            CASE
                WHEN e.dv_beta_derived >= :e2_threshold THEN 'E2'
                WHEN e.dv_beta_derived >= :e1_threshold THEN 'E1'
                WHEN e.dv_beta_derived IS NOT NULL THEN 'E0'
                ELSE NULL
            END AS dominant_zone,
            -- Three-tier scores
            e.dv_beta_derived AS eloundou_beta,
            m.ai_applicability_score AS ms_ai_applicability,
            a.observed_exposure AS aei_exposure,
            -- Drift (averaged across tasks for this occupation)
            drift_agg.avg_velocity AS drift_velocity,
            drift_agg.dominant_classification AS drift_classification,
            -- Metadata
            CURRENT_DATE AS profile_date,
            :release_year AS release_year
        FROM oews_employment ow
        -- Sector total for employment share
        JOIN (
            SELECT naics_code, SUM(employment) AS total_emp
            FROM oews_employment
            WHERE release_year = :release_year AND employment IS NOT NULL
            GROUP BY naics_code
        ) sector_total ON sector_total.naics_code = ow.naics_code
        -- O*NET occupation title (first match on prefix)
        LEFT JOIN LATERAL (
            SELECT title FROM onet_occupations
            WHERE onet_soc LIKE ow.onet_soc || '%'
            LIMIT 1
        ) o ON TRUE
        -- Eloundou (first 8-digit match)
        LEFT JOIN LATERAL (
            SELECT dv_beta_derived FROM eloundou_occ_scores
            WHERE onet_soc LIKE ow.onet_soc || '%'
            LIMIT 1
        ) e ON TRUE
        -- Microsoft AI applicability
        LEFT JOIN ms_ai_applicability_scores m ON m.soc_code = ow.onet_soc
        -- AEI job exposure
        LEFT JOIN aei_job_exposure a ON a.occ_code = ow.onet_soc
        -- AEI automation/augmentation averages (from latest snapshot with data)
        LEFT JOIN LATERAL (
            SELECT AVG(automation_pct) AS avg_automation,
                   AVG(augmentation_pct) AS avg_augmentation
            FROM aei_task_snapshots
            WHERE onet_soc_codes @> ARRAY[ow.onet_soc]
              AND automation_pct IS NOT NULL
        ) aei_auto ON TRUE
        -- Drift velocity aggregate (average across tasks for this occupation)
        LEFT JOIN LATERAL (
            SELECT AVG(tdm.velocity) AS avg_velocity,
                   MODE() WITHIN GROUP (ORDER BY tdm.classification) AS dominant_classification
            FROM task_drift_metrics tdm
            JOIN aei_task_snapshots ats ON ats.task_text = tdm.task_text
            WHERE ats.onet_soc_codes @> ARRAY[ow.onet_soc]
              AND tdm.velocity IS NOT NULL
            HAVING COUNT(*) > 0
        ) drift_agg ON TRUE
        WHERE ow.release_year = :release_year
          AND ow.employment IS NOT NULL
    """), {
        "release_year": release_year,
        "e2_threshold": E2_THRESHOLD,
        "e1_threshold": E1_THRESHOLD,
    })

    # Count rows created
    count_result = await session.execute(
        text("SELECT COUNT(*) FROM industry_occupation_profiles WHERE release_year = :year"),
        {"year": release_year},
    )
    rows_created = count_result.scalar() or 0

    logger.info("Industry profile computation complete: %d profiles created", rows_created)

    return rows_created
