"""CLI script to compute industry occupation profiles.

Usage:
    python -m scripts.compute_industry_profiles
    python -m scripts.compute_industry_profiles --year 2024
    python -m scripts.compute_industry_profiles --region AU --year 2025
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


async def run(release_year: int = 2024, region: str = "US") -> int:
    """Compute industry occupation profiles for a region. Returns profiles created."""
    async with async_session() as session:
        rows = await compute_industry_profiles(session, release_year=release_year, region=region)
        await session.commit()
    print(f"\n{region} industry profiles complete: {rows:,} profiles created")
    return rows


async def main(release_year: int, region: str) -> None:
    await run(release_year, region)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute industry occupation profiles")
    parser.add_argument(
        "--year", type=int, default=2024, help="Employment release year (default: 2024)"
    )
    parser.add_argument(
        "--region",
        default="US",
        choices=["US", "AU"],
        help="Region: US (OEWS/NAICS) or AU (ABS/ANZSIC)",
    )
    args = parser.parse_args()
    asyncio.run(main(args.year, args.region))
