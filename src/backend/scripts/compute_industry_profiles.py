"""CLI script to compute industry occupation profiles.

Usage:
    python -m scripts.compute_industry_profiles
    python -m scripts.compute_industry_profiles --year 2024
"""

import argparse
import asyncio
import logging

from app.db.session import async_session
from app.services.industry_profiles import compute_industry_profiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def main(release_year: int) -> None:
    async with async_session() as session:
        rows = await compute_industry_profiles(session, release_year=release_year)
        await session.commit()
        print(f"\nIndustry profiles complete: {rows:,} profiles created")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute industry occupation profiles")
    parser.add_argument("--year", type=int, default=2024, help="OEWS release year (default: 2024)")
    args = parser.parse_args()
    asyncio.run(main(args.year))
