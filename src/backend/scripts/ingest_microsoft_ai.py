"""CLI script to ingest Microsoft "Working with AI" dataset.

Usage:
    python -m scripts.ingest_microsoft_ai
    python -m scripts.ingest_microsoft_ai --path /path/to/files
"""

import argparse
import asyncio
import logging
import sys

from app.core.config import settings
from app.db.session import async_session
from app.services.microsoft_ai_ingestion import ingest_microsoft_ai

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(data_path: str | None = None) -> int:
    """Ingest the Microsoft AI applicability dataset. Returns total rows loaded."""
    data_path = data_path or settings.microsoft_ai_data_path
    async with async_session() as session:
        counts = await ingest_microsoft_ai(session, data_path)
    total = sum(counts.values())
    print("\nMicrosoft AI dataset ingestion complete:")
    for table, count in counts.items():
        print(f"  {table}: {count:,} rows")
    print(f"  TOTAL: {total:,} rows")
    return total


async def main(data_path: str) -> None:
    try:
        await run(data_path)
    except (ValueError, FileNotFoundError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest Microsoft 'Working with AI' dataset")
    parser.add_argument(
        "--path",
        default=settings.microsoft_ai_data_path,
        help=f"Data directory (default: {settings.microsoft_ai_data_path})",
    )
    args = parser.parse_args()
    asyncio.run(main(args.path))
