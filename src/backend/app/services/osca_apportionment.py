"""ANZSCO -> OSCA employment apportionment (FR-9.1, ADR-010).

Implements the apportionment ladder:
  A0  double-count guard: use 6-digit ANZSCO rows, plus only those 4-digit
      unit-group rows that have NO 6-digit detail in abs_employment (so the
      same employment is never counted at two granularities).
  A1  exact link: a base row with a single OSCA target gets all its employment
      (link_method='full', confidence=1.0).
  A3  equal split: a base row with N>1 OSCA targets and no finer employment to
      weight by is divided equally (link_method='apportioned_equal', lower
      confidence). ABS publishes no split proportions (ADR-010).

Reconciliation invariant: for every base row, the apportioned employment across
its OSCA targets sums back to the source employment (employment/N * N).
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# One statement expresses the whole ladder. map_dedup collapses duplicate
# (anzsco, osca) edges; base applies A0; edges fans out to OSCA targets at the
# right granularity; counted computes N per base row; the INSERT assigns
# employment, method and confidence per A1/A3.
_APPORTION_SQL = text("""
    INSERT INTO abs_employment_osca
        (osca_code, anzsco_code, anzsic_code, area_code, release_year,
         apportioned_employment, link_method, confidence, osca_version)
    WITH map_dedup AS (
        SELECT anzsco_code, osca_code, bool_or(correspondence_type = 'full') AS is_full
        FROM osca_anzsco_map
        GROUP BY anzsco_code, osca_code
    ),
    base AS (
        SELECT anzsco_code, anzsic_code, area_code, release_year, employment,
               length(anzsco_code) AS lvl
        FROM abs_employment ae
        WHERE length(anzsco_code) = 6
           OR (length(anzsco_code) = 4 AND NOT EXISTS (
                 SELECT 1 FROM abs_employment c
                 WHERE length(c.anzsco_code) = 6
                   AND c.anzsco_code LIKE ae.anzsco_code || '%'))
    ),
    edges AS (
        SELECT b.anzsco_code, b.anzsic_code, b.area_code, b.release_year,
               b.employment, b.lvl, m.osca_code
        FROM base b
        JOIN map_dedup m ON m.anzsco_code = b.anzsco_code
        WHERE b.lvl = 6
        GROUP BY b.anzsco_code, b.anzsic_code, b.area_code, b.release_year,
                 b.employment, b.lvl, m.osca_code
        UNION ALL
        SELECT b.anzsco_code, b.anzsic_code, b.area_code, b.release_year,
               b.employment, b.lvl, m.osca_code
        FROM base b
        JOIN map_dedup m ON m.anzsco_code LIKE b.anzsco_code || '%'
        WHERE b.lvl = 4
        GROUP BY b.anzsco_code, b.anzsic_code, b.area_code, b.release_year,
                 b.employment, b.lvl, m.osca_code
    ),
    counted AS (
        SELECT e.*,
               count(*) OVER (
                 PARTITION BY anzsco_code, anzsic_code, area_code, release_year
               ) AS n_targets
        FROM edges e
    )
    SELECT osca_code, anzsco_code, anzsic_code, area_code, release_year,
           employment::float / n_targets AS apportioned_employment,
           CASE WHEN n_targets = 1 THEN 'full' ELSE 'apportioned_equal' END AS link_method,
           CASE WHEN n_targets = 1 THEN 1.0
                WHEN lvl = 6 THEN 0.5
                ELSE 0.4 END AS confidence,
           :version AS osca_version
    FROM counted
    """)


async def compute_osca_employment(
    session: AsyncSession, version: str = "2024.1.0"
) -> dict[str, float]:
    """Apportion abs_employment ANZSCO -> OSCA per ADR-010. Returns summary stats."""
    await session.execute(text("DELETE FROM abs_employment_osca"))
    await session.execute(_APPORTION_SQL, {"version": version})

    stats = (await session.execute(text("""
                SELECT count(*) AS rows,
                       count(DISTINCT osca_code) AS occupations,
                       round(sum(apportioned_employment)) AS apportioned_emp
                FROM abs_employment_osca
                """))).one()

    # Reconciliation: apportioned total must equal the de-duplicated base total.
    base_emp = (await session.execute(text("""
                SELECT sum(employment) FROM abs_employment ae
                WHERE length(anzsco_code) = 6
                   OR (length(anzsco_code) = 4 AND NOT EXISTS (
                         SELECT 1 FROM abs_employment c
                         WHERE length(c.anzsco_code) = 6
                           AND c.anzsco_code LIKE ae.anzsco_code || '%'))
                """))).scalar_one()

    await session.commit()
    result = {
        "rows": float(stats.rows),
        "osca_occupations": float(stats.occupations),
        "apportioned_employment": float(stats.apportioned_emp or 0),
        "base_employment": float(base_emp or 0),
    }
    logger.info("OSCA apportionment complete: %s", result)
    return result
