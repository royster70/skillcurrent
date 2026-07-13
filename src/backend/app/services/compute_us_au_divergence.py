"""US-vs-AU occupation exposure divergence (FR-9.2).

Computes the US occupation exposure the same way as the AU side (tasks -> DWA
global beta, weighted by importance) so the two are comparable, then writes
`us_task_beta` and `divergence = us_task_beta - au_task_beta` onto
au_occupation_exposure.

US side: O*NET tasks (onet_tasks_to_dwas) weighted by IM task importance.
AU side: ASC tasks weighted by percent_of_time (already in au_task_beta).
OSCA -> US SOC via osca_anzsco_map -> anzsco_soc_concordance (4-digit ANZSCO).
Both use the same global AVG(dv_beta_derived) per DWA, so divergence isolates
the effect of AU vs US task STRUCTURE — the publishable insight.
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.transformations import tracked_transformation

logger = logging.getLogger(__name__)

_DIVERGENCE_SQL = text(
    """
    WITH global_beta AS (
        SELECT dwa_id, AVG(dv_beta_derived) AS beta
        FROM eloundou_dwa_scores
        WHERE dv_beta_derived IS NOT NULL
        GROUP BY dwa_id
    ),
    task_dwa AS (  -- per (soc, task): mean global beta over the task's DWAs
        SELECT td.onet_soc, td.task_id, AVG(g.beta) AS tb
        FROM onet_tasks_to_dwas td
        JOIN global_beta g ON g.dwa_id = td.dwa_id
        GROUP BY td.onet_soc, td.task_id
    ),
    task_imp AS (  -- IM importance per (soc, task)
        SELECT onet_soc, task_id, AVG(data_value) AS imp
        FROM onet_task_ratings
        WHERE scale_id = 'IM'
        GROUP BY onet_soc, task_id
    ),
    soc_beta AS (  -- US task-weighted occupation exposure per SOC
        SELECT td.onet_soc,
               SUM(td.tb * COALESCE(ti.imp, 1))
                 / NULLIF(SUM(COALESCE(ti.imp, 1)), 0) AS us_beta
        FROM task_dwa td
        LEFT JOIN task_imp ti ON ti.onet_soc = td.onet_soc AND ti.task_id = td.task_id
        GROUP BY td.onet_soc
    ),
    osca_soc AS (  -- OSCA -> mean US beta over its mapped SOC(s)
        SELECT m.osca_code, AVG(sb.us_beta) AS us_beta
        FROM osca_anzsco_map m
        JOIN anzsco_soc_concordance sc
          ON sc.anzsco_code = substring(m.anzsco_code FROM 1 FOR 4)
        JOIN soc_beta sb ON sb.onet_soc = sc.onet_soc
        GROUP BY m.osca_code
    )
    UPDATE au_occupation_exposure x
    SET us_task_beta = os.us_beta,
        divergence = os.us_beta - x.au_task_beta
    FROM osca_soc os
    WHERE os.osca_code = x.osca_code
    """
)


@tracked_transformation(
    name="compute_us_au_divergence",
    sources=[
        "au_occupation_exposure",
        "onet_tasks_to_dwas",
        "eloundou_dwa_scores",
        "anzsco_soc_concordance",
        "osca_anzsco_map",
    ],
    target="au_occupation_exposure",
)
async def _compute(session: AsyncSession) -> int:
    result = await session.execute(_DIVERGENCE_SQL)
    return result.rowcount or 0  # type: ignore[attr-defined]


async def compute_us_au_divergence(session: AsyncSession) -> dict[str, float]:
    """Populate us_task_beta + divergence on au_occupation_exposure. Returns stats."""
    await _compute(session)
    stats = (
        await session.execute(
            text(
                """
                SELECT count(*) AS total,
                       count(divergence) AS with_divergence,
                       round(avg(divergence)::numeric, 4) AS avg_div,
                       round(avg(abs(divergence))::numeric, 4) AS avg_abs_div
                FROM au_occupation_exposure
                """
            )
        )
    ).one()
    await session.commit()
    result = {
        "occupations": float(stats.total),
        "with_divergence": float(stats.with_divergence),
        "avg_divergence": float(stats.avg_div or 0),
        "avg_abs_divergence": float(stats.avg_abs_div or 0),
    }
    logger.info("US-AU divergence complete: %s", result)
    return result
