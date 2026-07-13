"""CLI to ingest the Australian Skills Classification v3.0 (FR-9.2, ADR-011).

Reads the three ASC layers from `strayr` .rda files.

Usage:
    python -m scripts.ingest_asc
    python -m scripts.ingest_asc --path "C:/Users/royst/Projects/Data/ASC" --version 3.0
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from app.db.session import async_session
from app.services.asc_ingestion import ingest_asc

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

_DEFAULT_PATH = Path(__file__).resolve().parents[4] / "Data" / "ASC"


async def main(data_path: str, version: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_asc(session, data_path, version)
            print(f"\nASC {version} ingestion complete:")
            for table, count in counts.items():
                print(f"  {table}: {count:,} rows")
            print(f"  TOTAL: {sum(counts.values()):,} rows")
        except (ValueError, FileNotFoundError) as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest ASC v3.0 data files")
    parser.add_argument(
        "--path",
        default=str(_DEFAULT_PATH),
        help=f"Path to ASC data directory (default: {_DEFAULT_PATH})",
    )
    parser.add_argument("--version", default="3.0", help="ASC version key")
    args = parser.parse_args()
    asyncio.run(main(args.path, args.version))
