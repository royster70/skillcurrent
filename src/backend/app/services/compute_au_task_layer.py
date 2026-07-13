"""Populate au_task with DWA-derived AU-native exposure (FR-9.2, ADR-011).

Attaches Eloundou DWA exposure to ASC specialist tasks via the semantic bridge,
then expands each task to its OSCA occupation(s) and rolls up to an occupation
task-weighted exposure. Task exposure uses global AVG(dv_beta_derived) of the
matched DWA(s) — the same distributed-DWA scale the existing task_matrix uses
for US tasks, so US and AU are comparable (decision-point #2: global-AVG primary;
au_native_beta_soc reserved for the later SOC-specific fallback-ladder rung).

All measured tasks are tier T2 (semantic); there is no L1 (B0). Occupation-level
zone Beta is a SEPARATE plane and is not recomputed here.
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.transformations import tracked_transformation

logger = logging.getLogger(__name__)

# ASC task -> matched DWA(s) -> global-avg beta -> expand to OSCA occupation(s).
_AU_TASK_SQL = text(
    """
    INSERT INTO au_task
        (osca_code, anzsco_code, task_source, task_text, percent_of_time,
         task_level_available, task_level_method, confidence, matched_dwa_id,
         au_native_beta, beta_source)
    WITH global_beta AS (
        SELECT dwa_id, AVG(dv_beta_derived) AS beta
        FROM eloundou_dwa_scores
        WHERE dv_beta_derived IS NOT NULL
        GROUP BY dwa_id
    ),
    task_beta AS (
        SELECT b.specialist_task,
               SUM(g.beta * b.cosine_similarity)
                 / NULLIF(SUM(b.cosine_similarity), 0) AS beta,
               MAX(b.cosine_similarity) AS conf,
               (ARRAY_AGG(b.dwa_id ORDER BY b.cosine_similarity DESC))[1] AS top_dwa
        FROM dwa_asc_bridge b
        JOIN global_beta g ON g.dwa_id = b.dwa_id
        GROUP BY b.specialist_task
    ),
    osca_expand AS (
        SELECT DISTINCT a.anzsco_code, a.specialist_task,
               a.percent_of_time_spent_on_task AS pot, m.osca_code
        FROM asc_specialist_task a
        JOIN osca_anzsco_map m
          ON (m.anzsco_code = a.anzsco_code OR m.anzsco_code LIKE a.anzsco_code || '%')
    )
    SELECT e.osca_code, e.anzsco_code, 'ASC_specialist', e.specialist_task, e.pot,
           (tb.beta IS NOT NULL),
           CASE WHEN tb.beta IS NOT NULL THEN 'T2' ELSE 'NA' END,
           tb.conf, tb.top_dwa, tb.beta,
           CASE WHEN tb.beta IS NOT NULL THEN 'global_avg' END
    FROM osca_expand e
    LEFT JOIN task_beta tb ON tb.specialist_task = e.specialist_task
    """
)

_ROLLUP_SQL = text(
    """
    INSERT INTO au_occupation_exposure
        (osca_code, au_task_beta, task_count, measured_task_count, coverage_pct)
    SELECT osca_code,
           SUM(au_native_beta * COALESCE(percent_of_time, 1))
             FILTER (WHERE au_native_beta IS NOT NULL)
             / NULLIF(SUM(COALESCE(percent_of_time, 1))
                      FILTER (WHERE au_native_beta IS NOT NULL), 0) AS au_task_beta,
           count(*) AS task_count,
           count(au_native_beta) AS measured_task_count,
           round((100.0 * count(au_native_beta) / count(*))::numeric, 1) AS coverage_pct
    FROM au_task
    WHERE task_source = 'ASC_specialist'
    GROUP BY osca_code
    """
)


@tracked_transformation(
    name="compute_au_task_layer",
    sources=["asc_specialist_task", "dwa_asc_bridge", "eloundou_dwa_scores", "osca_anzsco_map"],
    target="au_task",
)
async def _compute(session: AsyncSession) -> int:
    await session.execute(text("DELETE FROM au_occupation_exposure"))
    await session.execute(text("DELETE FROM au_task"))
    await session.execute(_AU_TASK_SQL)
    await session.execute(_ROLLUP_SQL)
    return int((await session.execute(text("SELECT count(*) FROM au_task"))).scalar_one())


async def compute_au_task_layer(session: AsyncSession) -> dict[str, float]:
    """Build the au_task layer + occupation rollup. Returns summary stats."""
    await _compute(session)
    stats = (
        await session.execute(
            text(
                """
                SELECT count(*) AS rows,
                       count(*) FILTER (WHERE task_level_available) AS measured,
                       count(DISTINCT osca_code) AS occupations
                FROM au_task
                """
            )
        )
    ).one()
    cov = (
        await session.execute(
            text(
                "SELECT round(avg(coverage_pct)::numeric, 1), round(avg(au_task_beta)::numeric, 4) "
                "FROM au_occupation_exposure"
            )
        )
    ).one()
    await session.commit()
    result = {
        "au_task_rows": float(stats.rows),
        "measured": float(stats.measured),
        "occupations": float(stats.occupations),
        "avg_occupation_coverage_pct": float(cov[0] or 0),
        "avg_occupation_au_beta": float(cov[1] or 0),
    }
    logger.info("AU task layer complete: %s", result)
    return result
