"""Verify drift calculation results."""

import asyncio
import logging

from sqlalchemy import text

from app.db.session import async_session

logging.basicConfig(level=logging.INFO, format="%(message)s")


def fmt(val, spec=".6f"):
    return f"{val:{spec}}" if val is not None else "n/a"


async def main() -> None:
    async with async_session() as s:
        r = await s.execute(
            text(
                """
            SELECT classification, COUNT(*),
                   AVG(velocity), AVG(latest_task_pct)
            FROM task_drift_metrics GROUP BY classification ORDER BY COUNT(*) DESC
        """
            )
        )
        print("=== Classification Distribution ===")
        for row in r.fetchall():
            cls = row[0] or "unclassified"
            print(
                f"  {cls}: {row[1]:,} tasks "
                f"(avg vel={fmt(row[2])}, avg pct={fmt(row[3], '.4f')})"
            )

        r = await s.execute(
            text(
                """
            SELECT snapshot_count, COUNT(*) FROM task_drift_metrics
            GROUP BY snapshot_count ORDER BY snapshot_count
        """
            )
        )
        print("\n=== Tasks by Snapshot Count ===")
        for row in r.fetchall():
            print(f"  {row[0]} snapshots: {row[1]:,} tasks")

        r = await s.execute(
            text(
                """
            SELECT task_text, velocity, latest_task_pct, snapshot_count, r_squared
            FROM task_drift_metrics
            WHERE classification = 'departing' AND snapshot_count >= 3
            ORDER BY velocity DESC LIMIT 10
        """
            )
        )
        print("\n=== Top 10 Departing (fastest growing AI usage) ===")
        for row in r.fetchall():
            print(
                f"  vel={fmt(row[1])} pct={fmt(row[2], '.4f')} "
                f"R2={fmt(row[4], '.3f')} [{row[3]} snaps] {row[0][:70]}"
            )

        r = await s.execute(
            text(
                """
            SELECT COUNT(*) FROM task_drift_metrics
            WHERE classification = 'below_threshold'
        """
            )
        )
        bt = r.scalar()
        print(f"\n=== Below Threshold (will flip zone soon): {bt} tasks ===")
        if bt > 0:
            r = await s.execute(
                text(
                    """
                SELECT task_text, velocity, latest_task_pct
                FROM task_drift_metrics WHERE classification = 'below_threshold'
                ORDER BY velocity DESC LIMIT 5
            """
                )
            )
            for row in r.fetchall():
                print(f"  vel={fmt(row[1])} pct={fmt(row[2], '.4f')} {row[0][:70]}")

        r = await s.execute(
            text(
                """
            SELECT task_text, velocity, latest_task_pct, snapshot_count
            FROM task_drift_metrics
            WHERE classification = 'enduring' AND snapshot_count >= 3
            ORDER BY latest_task_pct DESC LIMIT 5
        """
            )
        )
        print("\n=== Top 5 Enduring (stable, highest usage) ===")
        for row in r.fetchall():
            print(
                f"  vel={fmt(row[1])} pct={fmt(row[2], '.4f')} " f"[{row[3]} snaps] {row[0][:70]}"
            )

        r = await s.execute(
            text(
                """
            SELECT task_text, velocity, latest_task_pct
            FROM task_drift_metrics WHERE classification = 'emerging'
            ORDER BY COALESCE(latest_task_pct, 0) DESC LIMIT 5
        """
            )
        )
        print("\n=== Top 5 Emerging (new task patterns) ===")
        for row in r.fetchall():
            print(f"  vel={fmt(row[1])} pct={fmt(row[2], '.4f')} {row[0][:70]}")

        r = await s.execute(
            text(
                """
            SELECT name, status, rows_affected FROM transformation_log ORDER BY id DESC LIMIT 2
        """
            )
        )
        print("\n=== Transformation Log ===")
        for row in r.fetchall():
            print(f"  {row[0]}: {row[1]}, {row[2]:,} rows")


if __name__ == "__main__":
    asyncio.run(main())
