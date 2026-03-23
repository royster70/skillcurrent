"""Cross-dataset insight queries — proves all datasets can be combined."""

import asyncio
import logging

from sqlalchemy import text

from app.db.session import async_session

logging.basicConfig(level=logging.INFO, format="%(message)s")


async def main() -> None:
    async with async_session() as s:
        # === 1. Three-tier evidence for a single occupation ===
        print("=== Three-Tier Evidence: Software Developers (15-1252.00) ===")
        r = await s.execute(text("""
            SELECT
                o.onet_soc, o.title,
                e.dv_beta_derived,
                e.human_beta_derived,
                m.ai_applicability_score,
                a.observed_exposure,
                ow.employment,
                ow.mean_annual_wage
            FROM onet_occupations o
            LEFT JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
            LEFT JOIN ms_ai_applicability_scores m ON o.onet_soc LIKE m.soc_code || '%'
            LEFT JOIN aei_job_exposure a ON o.onet_soc LIKE a.occ_code || '%'
            LEFT JOIN oews_employment ow ON ow.onet_soc = SUBSTRING(o.onet_soc, 1, 7)
                AND ow.naics_code = '99'
            WHERE o.onet_soc = '15-1252.00'
        """))
        for row in r.fetchall():
            print(f"  {row[0]} {row[1]}")
            print(f"    Eloundou Beta (GPT-4):  {row[2]:.4f}" if row[2] else "    Eloundou Beta: n/a")
            print(f"    Eloundou Beta (Human):  {row[3]:.4f}" if row[3] else "    Eloundou Human: n/a")
            print(f"    Microsoft Applicability: {row[4]:.4f}" if row[4] else "    Microsoft: n/a")
            print(f"    AEI Observed Exposure:   {row[5]:.4f}" if row[5] else "    AEI: n/a")
            print(f"    OEWS Employment:         {row[6]:,}" if row[6] else "    Employment: n/a")
            print(f"    Mean Annual Wage:        ${row[7]:,}" if row[7] else "    Wage: n/a")

        # === 2. Top 10 by combined signal ===
        print("\n=== Top 10: Highest Combined AI Signal (all 3 sources) ===")
        r = await s.execute(text("""
            SELECT
                o.onet_soc, o.title,
                e.dv_beta_derived,
                m.ai_applicability_score,
                a.observed_exposure,
                (COALESCE(e.dv_beta_derived, 0) +
                 COALESCE(m.ai_applicability_score, 0) +
                 COALESCE(a.observed_exposure, 0)) / 3.0 AS combined
            FROM onet_occupations o
            JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
            JOIN ms_ai_applicability_scores m ON o.onet_soc LIKE m.soc_code || '%'
            JOIN aei_job_exposure a ON o.onet_soc LIKE a.occ_code || '%'
            WHERE e.dv_beta_derived IS NOT NULL
            ORDER BY combined DESC
            LIMIT 10
        """))
        for row in r.fetchall():
            print(f"  {row[0]} {row[1][:50]}")
            print(f"    Eloundou={row[2]:.3f}  Microsoft={row[3]:.3f}  AEI={row[4]:.3f}  Combined={row[5]:.3f}")

        # === 3. Adoption gap ===
        print("\n=== Adoption Gap: High Theoretical, Low Empirical ===")
        print("  (Eloundou Beta > 0.5 but Microsoft < 0.1)")
        r = await s.execute(text("""
            SELECT o.title,
                   e.dv_beta_derived,
                   m.ai_applicability_score,
                   e.dv_beta_derived - m.ai_applicability_score AS gap
            FROM onet_occupations o
            JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
            JOIN ms_ai_applicability_scores m ON o.onet_soc LIKE m.soc_code || '%'
            WHERE e.dv_beta_derived > 0.5 AND m.ai_applicability_score < 0.1
            ORDER BY gap DESC
            LIMIT 10
        """))
        for row in r.fetchall():
            print(f"  {row[0][:50]}: Eloundou={row[1]:.3f} vs Microsoft={row[2]:.3f} (gap={row[3]:.3f})")

        # === 4. Drift: tasks changing most across model eras ===
        print("\n=== Drift: Tasks Growing Fastest (Sonnet 3.5 -> 4.5) ===")
        r = await s.execute(text("""
            WITH early AS (
                SELECT task_text, task_pct FROM aei_task_snapshots
                WHERE model_era = 'sonnet-3.5' AND platform = 'claude_ai'
            ),
            late AS (
                SELECT task_text, task_pct FROM aei_task_snapshots
                WHERE model_era = 'sonnet-4.5' AND platform = 'claude_ai'
            )
            SELECT e.task_text,
                   e.task_pct AS early_pct,
                   l.task_pct AS late_pct,
                   l.task_pct - e.task_pct AS delta
            FROM early e JOIN late l ON l.task_text = e.task_text
            WHERE e.task_pct > 0.01
            ORDER BY delta DESC LIMIT 10
        """))
        for row in r.fetchall():
            direction = "DEPARTING" if row[3] > 0 else "ENDURING"
            print(f"  [{direction}] {row[0][:65]}")
            print(f"    S3.5={row[1]:.4f} -> S4.5={row[2]:.4f} (delta={row[3]:+.4f})")

        # === 5. Tasks declining fastest ===
        print("\n=== Drift: Tasks Declining Fastest (potential ENDURING) ===")
        r = await s.execute(text("""
            WITH early AS (
                SELECT task_text, task_pct FROM aei_task_snapshots
                WHERE model_era = 'sonnet-3.5' AND platform = 'claude_ai'
            ),
            late AS (
                SELECT task_text, task_pct FROM aei_task_snapshots
                WHERE model_era = 'sonnet-4.5' AND platform = 'claude_ai'
            )
            SELECT e.task_text,
                   e.task_pct AS early_pct,
                   l.task_pct AS late_pct,
                   l.task_pct - e.task_pct AS delta
            FROM early e JOIN late l ON l.task_text = e.task_text
            WHERE e.task_pct > 0.05
            ORDER BY delta ASC LIMIT 10
        """))
        for row in r.fetchall():
            print(f"  [ENDURING] {row[0][:65]}")
            print(f"    S3.5={row[1]:.4f} -> S4.5={row[2]:.4f} (delta={row[3]:+.4f})")

        # === 6. DWA-level: Eloundou vs Microsoft ===
        print("\n=== DWA-Level: Eloundou Theoretical vs Microsoft Empirical ===")
        r = await s.execute(text("""
            SELECT d.dwa_title,
                   AVG(eds.dv_beta_derived) AS eloundou_beta,
                   m.completion_ai,
                   m.impact_scope_ai
            FROM eloundou_dwa_scores eds
            JOIN onet_dwa_references d ON d.dwa_id = eds.dwa_id
            JOIN ms_ai_iwa_metrics m ON m.iwa_code = d.iwa_id
            GROUP BY d.dwa_title, m.completion_ai, m.impact_scope_ai
            ORDER BY eloundou_beta DESC
            LIMIT 10
        """))
        for row in r.fetchall():
            print(f"  {row[0][:55]}")
            print(f"    Eloundou Beta={row[1]:.4f}  MS Completion={row[2]:.3f}  MS Impact={row[3]:.3f}")

        # === 7. Employment-weighted exposure ===
        print("\n=== Employment-Weighted: Most Exposed Workers (headcount x Eloundou Beta) ===")
        r = await s.execute(text("""
            SELECT o.title,
                   e.dv_beta_derived,
                   SUM(ow.employment) AS total_emp,
                   e.dv_beta_derived * SUM(ow.employment) AS weighted_exposure
            FROM onet_occupations o
            JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
            JOIN oews_employment ow ON ow.onet_soc = SUBSTRING(o.onet_soc, 1, 7)
            WHERE ow.employment IS NOT NULL
            GROUP BY o.title, e.dv_beta_derived
            ORDER BY weighted_exposure DESC
            LIMIT 10
        """))
        for row in r.fetchall():
            print(f"  {row[0][:50]}: Beta={row[1]:.3f} x {row[2]:,} workers = {row[3]:,.0f} weighted exposure")


if __name__ == "__main__":
    asyncio.run(main())
