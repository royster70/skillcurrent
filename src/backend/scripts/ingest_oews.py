"""CLI script to ingest BLS OEWS employment data.

Usage:
    python -m scripts.ingest_oews
    python -m scripts.ingest_oews --path /path/to/dir
"""

import argparse
import asyncio
import logging
import sys

from app.core.config import settings
from app.db.session import async_session
from app.services.oews_ingestion import ingest_oews

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(data_path: str | None = None) -> int:
    """Ingest BLS OEWS employment data. Returns total rows loaded."""
    data_path = data_path or settings.oews_data_path
    async with async_session() as session:
        counts = await ingest_oews(session, data_path)
    total = sum(counts.values())
    print("\nOEWS ingestion complete:")
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
    parser = argparse.ArgumentParser(description="Ingest BLS OEWS employment data")
    parser.add_argument(
        "--path",
        default=settings.oews_data_path,
        help=f"Data directory (default: {settings.oews_data_path})",
    )
    args = parser.parse_args()
    asyncio.run(main(args.path))
