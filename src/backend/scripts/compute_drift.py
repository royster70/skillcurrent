"""CLI script to compute task drift velocity and classification.

Usage:
    python -m scripts.compute_drift
    python -m scripts.compute_drift --platform 1p_api
"""

import argparse
import asyncio
import logging

from app.db.session import async_session
from app.services.drift_calculation import compute_task_drift

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def main(platform: str) -> None:
    async with async_session() as session:
        rows = await compute_task_drift(session, platform=platform)
        await session.commit()
        print(f"\nDrift calculation complete: {rows:,} tasks processed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute task drift velocity")
    parser.add_argument("--platform", default="claude_ai", help="Platform filter (default: claude_ai)")
    args = parser.parse_args()
    asyncio.run(main(args.platform))
