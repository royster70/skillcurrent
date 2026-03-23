"""CLI script to ingest Eloundou occupation-level exposure scores.

Usage:
    python -m scripts.ingest_eloundou
    python -m scripts.ingest_eloundou --path /path/to/dir
"""

import argparse
import asyncio
import logging
import sys

from app.db.session import async_session
from app.services.eloundou_ingestion import ingest_eloundou

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

DEFAULT_PATH = r"C:\Users\royst\Projects\Data\OpenAI-Exposure-Score"


async def main(data_path: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_eloundou(session, data_path)
            print(f"\nEloundou ingestion complete:")
            for table, count in counts.items():
                print(f"  {table}: {count:,} rows")
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)
        except FileNotFoundError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest Eloundou exposure scores")
    parser.add_argument("--path", default=DEFAULT_PATH, help=f"Data directory (default: {DEFAULT_PATH})")
    args = parser.parse_args()
    asyncio.run(main(args.path))
