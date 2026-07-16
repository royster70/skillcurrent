"""CLI to ingest OSCA 2024 v1.0 (ABS) — AU occupation backbone (FR-9.1).

Usage:
    python -m scripts.ingest_osca
    python -m scripts.ingest_osca --path "$DATA_ROOT/OSCA" --version 2024.1.0
"""

import argparse
import asyncio
import logging
import sys

from app.core.config import settings
from app.db.session import async_session
from app.services.osca_ingestion import ingest_osca

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(data_path: str | None = None, version: str = "2024.1.0") -> int:
    """Ingest OSCA 2024 backbone. Returns total rows loaded.

    Shared entry point for the CLI and the pipeline orchestrator.
    """
    data_path = data_path or settings.osca_data_path
    async with async_session() as session:
        counts = await ingest_osca(session, data_path, version)
    total = sum(counts.values())
    print(f"\nOSCA {version} ingestion complete:")
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
    parser = argparse.ArgumentParser(description="Ingest OSCA 2024 data files")
    parser.add_argument(
        "--path",
        default=settings.osca_data_path,
        help=f"Path to OSCA data directory (default: {settings.osca_data_path})",
    )
    parser.add_argument("--version", default="2024.1.0", help="OSCA version key")
    args = parser.parse_args()
    asyncio.run(main(args.path, args.version))
