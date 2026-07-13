"""CLI script to ingest GDPval benchmark tasks.

Usage:
    python -m scripts.ingest_gdpval
    python -m scripts.ingest_gdpval --path /path/to/GDPval
"""

import argparse
import asyncio
import logging
import sys

from app.core.config import settings
from app.db.session import async_session
from app.services.gdpval_ingestion import ingest_gdpval

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(data_path: str | None = None) -> int:
    """Ingest GDPval tasks + rubric items. Returns total rows loaded."""
    data_path = data_path or settings.gdpval_data_path
    async with async_session() as session:
        counts = await ingest_gdpval(session, data_path)
    total = counts["task_count"] + counts["rubric_item_count"]
    print("\nGDPval ingestion complete:")
    print(f"  Tasks:        {counts['task_count']:,}")
    print(f"  Rubric items: {counts['rubric_item_count']:,}")
    return total


async def main(data_path: str) -> None:
    try:
        await run(data_path)
    except (ValueError, FileNotFoundError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest GDPval benchmark tasks")
    parser.add_argument(
        "--path",
        default=settings.gdpval_data_path,
        help=f"GDPval directory (default: {settings.gdpval_data_path})",
    )
    args = parser.parse_args()
    asyncio.run(main(args.path))
