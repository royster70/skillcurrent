"""CLI script to ingest BLS OEWS employment data.

Usage:
    python -m scripts.ingest_oews
    python -m scripts.ingest_oews --path /path/to/dir
"""

import argparse
import asyncio
import logging
import sys

from app.db.session import async_session
from app.services.oews_ingestion import ingest_oews

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

DEFAULT_PATH = r"C:\Users\royst\Projects\Data\BLS\oesm24in4"


async def main(data_path: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_oews(session, data_path)
            print(f"\nOEWS ingestion complete:")
            for table, count in counts.items():
                print(f"  {table}: {count:,} rows")
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)
        except FileNotFoundError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest BLS OEWS employment data")
    parser.add_argument("--path", default=DEFAULT_PATH, help=f"Data directory (default: {DEFAULT_PATH})")
    args = parser.parse_args()
    asyncio.run(main(args.path))
