"""CLI to ingest the Australian Skills Classification v3.0 (FR-9.2, ADR-011).

Reads the three ASC layers from `strayr` .rda files.

Usage:
    python -m scripts.ingest_asc
    python -m scripts.ingest_asc --path "$DATA_ROOT/ASC" --version 3.0
"""

import argparse
import asyncio
import logging
import sys

from app.core.config import settings
from app.db.session import async_session
from app.services.asc_ingestion import ingest_asc

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(data_path: str | None = None, version: str = "3.0") -> int:
    """Ingest the Australian Skills Classification v3.0. Returns total rows loaded.

    Shared entry point for the CLI and the pipeline orchestrator.
    """
    data_path = data_path or settings.asc_data_path
    async with async_session() as session:
        counts = await ingest_asc(session, data_path, version)
    total = sum(counts.values())
    print(f"\nASC {version} ingestion complete:")
    for table, count in counts.items():
        print(f"  {table}: {count:,} rows")
    print(f"  TOTAL: {total:,} rows")
    return total


async def main(data_path: str, version: str) -> None:
    try:
        await run(data_path, version)
    except (ValueError, FileNotFoundError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest ASC v3.0 data files")
    parser.add_argument(
        "--path",
        default=settings.asc_data_path,
        help=f"Path to ASC data directory (default: {settings.asc_data_path})",
    )
    parser.add_argument("--version", default="3.0", help="ASC version key")
    args = parser.parse_args()
    asyncio.run(main(args.path, args.version))
