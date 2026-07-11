"""CLI to ingest OSCA 2024 v1.0 (ABS) — AU occupation backbone (FR-9.1).

Usage:
    python -m scripts.ingest_osca
    python -m scripts.ingest_osca --path "C:/Users/royst/Projects/Data/OSCA" --version 2024.1.0
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from app.db.session import async_session
from app.services.osca_ingestion import ingest_osca

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

_DEFAULT_PATH = Path(__file__).resolve().parents[4] / "Data" / "OSCA"


async def main(data_path: str, version: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_osca(session, data_path, version)
            print(f"\nOSCA {version} ingestion complete:")
            for table, count in counts.items():
                print(f"  {table}: {count:,} rows")
            print(f"  TOTAL: {sum(counts.values()):,} rows")
        except (ValueError, FileNotFoundError) as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest OSCA 2024 data files")
    parser.add_argument(
        "--path",
        default=str(_DEFAULT_PATH),
        help=f"Path to OSCA data directory (default: {_DEFAULT_PATH})",
    )
    parser.add_argument("--version", default="2024.1.0", help="OSCA version key")
    args = parser.parse_args()
    asyncio.run(main(args.path, args.version))
