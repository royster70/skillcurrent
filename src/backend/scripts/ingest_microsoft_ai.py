"""CLI script to ingest Microsoft "Working with AI" dataset.

Usage:
    python -m scripts.ingest_microsoft_ai
    python -m scripts.ingest_microsoft_ai --path /path/to/files
"""

import argparse
import asyncio
import logging
import sys

from app.db.session import async_session
from app.services.microsoft_ai_ingestion import ingest_microsoft_ai

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

DEFAULT_PATH = r"C:\Users\royst\Projects\Data\microsoft-working-with-ai"


async def main(data_path: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_microsoft_ai(session, data_path)
            print(f"\nMicrosoft AI dataset ingestion complete:")
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
    parser = argparse.ArgumentParser(
        description="Ingest Microsoft 'Working with AI' dataset"
    )
    parser.add_argument("--path", default=DEFAULT_PATH, help=f"Data directory (default: {DEFAULT_PATH})")
    args = parser.parse_args()
    asyncio.run(main(args.path))
