"""CLI script to ingest O*NET data into the database.

Usage:
    python -m scripts.ingest_onet
    python -m scripts.ingest_onet --path /path/to/onet/files --version 28.1
"""

import argparse
import asyncio
import logging
import sys

from app.core.config import settings
from app.db.session import async_session
from app.services.onet_ingestion import ingest_onet

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def main(data_path: str, version: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_onet(session, data_path, version)
            print(f"\nO*NET {version} ingestion complete:")
            for table, count in counts.items():
                print(f"  {table}: {count:,} rows")
            print(f"  TOTAL: {sum(counts.values()):,} rows")
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)
        except FileNotFoundError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest O*NET data files")
    parser.add_argument(
        "--path",
        default=settings.onet_data_path,
        help=f"Path to O*NET data directory (default: {settings.onet_data_path})",
    )
    parser.add_argument(
        "--version",
        default=settings.onet_version,
        help=f"O*NET version string (default: {settings.onet_version})",
    )
    args = parser.parse_args()
    asyncio.run(main(args.path, args.version))
