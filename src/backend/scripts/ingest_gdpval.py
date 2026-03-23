"""CLI script to ingest GDPval benchmark tasks.

Usage:
    python -m scripts.ingest_gdpval
    python -m scripts.ingest_gdpval --path /path/to/GDPval
"""

import argparse
import asyncio
import logging
import sys

from app.db.session import async_session
from app.services.gdpval_ingestion import ingest_gdpval

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

DEFAULT_PATH = r"C:\Users\royst\Projects\Data\GDPval"


async def main(data_path: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_gdpval(session, data_path)
            print(f"\nGDPval ingestion complete:")
            print(f"  Tasks:        {counts['task_count']:,}")
            print(f"  Rubric items: {counts['rubric_item_count']:,}")
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)
        except FileNotFoundError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest GDPval benchmark tasks")
    parser.add_argument(
        "--path",
        default=DEFAULT_PATH,
        help=f"GDPval directory (default: {DEFAULT_PATH})",
    )
    args = parser.parse_args()
    asyncio.run(main(args.path))
