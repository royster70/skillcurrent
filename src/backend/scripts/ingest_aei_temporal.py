"""CLI script to ingest AEI temporal releases (all 4 model eras).

Usage:
    python -m scripts.ingest_aei_temporal
    python -m scripts.ingest_aei_temporal --path /path/to/AEI-full
"""

import argparse
import asyncio
import logging
import sys

from app.db.session import async_session
from app.services.aei_temporal_ingestion import ingest_aei_temporal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

DEFAULT_PATH = r"C:\Users\royst\Projects\Data\AEI\AEI-full"


async def main(data_path: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_aei_temporal(session, data_path)
            print(f"\nAEI temporal ingestion complete:")
            for release, count in counts.items():
                print(f"  {release}: {count:,} tasks")
            print(f"  TOTAL: {sum(counts.values()):,} rows")
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)
        except FileNotFoundError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest AEI temporal releases")
    parser.add_argument("--path", default=DEFAULT_PATH, help=f"AEI-full directory (default: {DEFAULT_PATH})")
    args = parser.parse_args()
    asyncio.run(main(args.path))
