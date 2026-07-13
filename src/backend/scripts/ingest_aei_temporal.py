"""CLI script to ingest AEI temporal releases (all 4 model eras).

Usage:
    python -m scripts.ingest_aei_temporal
    python -m scripts.ingest_aei_temporal --path /path/to/AEI-full
"""

import argparse
import asyncio
import logging
import sys

from app.core.config import settings
from app.db.session import async_session
from app.services.aei_temporal_ingestion import ingest_aei_temporal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(data_path: str | None = None) -> int:
    """Ingest AEI temporal snapshots (all model eras). Returns total rows loaded."""
    data_path = data_path or settings.aei_temporal_data_path
    async with async_session() as session:
        counts = await ingest_aei_temporal(session, data_path)
    total = sum(counts.values())
    print("\nAEI temporal ingestion complete:")
    for release, count in counts.items():
        print(f"  {release}: {count:,} tasks")
    print(f"  TOTAL: {total:,} rows")
    return total


async def main(data_path: str) -> None:
    try:
        await run(data_path)
    except (ValueError, FileNotFoundError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest AEI temporal releases")
    parser.add_argument(
        "--path",
        default=settings.aei_temporal_data_path,
        help=f"AEI-full directory (default: {settings.aei_temporal_data_path})",
    )
    args = parser.parse_args()
    asyncio.run(main(args.path))
