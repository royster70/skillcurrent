"""CLI script to ingest Eloundou occupation-level exposure scores.

Usage:
    python -m scripts.ingest_eloundou
    python -m scripts.ingest_eloundou --path /path/to/dir
"""

import argparse
import asyncio
import logging
import sys

from app.core.config import settings
from app.db.session import async_session
from app.services.eloundou_ingestion import ingest_eloundou

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(data_path: str | None = None) -> int:
    """Ingest Eloundou occupation scores. Returns total rows loaded."""
    data_path = data_path or settings.eloundou_data_path
    async with async_session() as session:
        counts = await ingest_eloundou(session, data_path)
    total = sum(counts.values())
    print("\nEloundou ingestion complete:")
    for table, count in counts.items():
        print(f"  {table}: {count:,} rows")
    return total


async def main(data_path: str) -> None:
    try:
        await run(data_path)
    except (ValueError, FileNotFoundError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest Eloundou exposure scores")
    parser.add_argument(
        "--path",
        default=settings.eloundou_data_path,
        help=f"Data directory (default: {settings.eloundou_data_path})",
    )
    args = parser.parse_args()
    asyncio.run(main(args.path))
