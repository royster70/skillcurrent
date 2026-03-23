"""CLI script to ingest AEI labor market impact data.

Usage:
    python -m scripts.ingest_aei
    python -m scripts.ingest_aei --path /path/to/dir
"""

import argparse
import asyncio
import logging
import sys

from app.db.session import async_session
from app.services.aei_ingestion import ingest_aei_labor_market

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

DEFAULT_PATH = r"C:\Users\royst\Projects\Data\AEI"


async def main(data_path: str) -> None:
    async with async_session() as session:
        try:
            counts = await ingest_aei_labor_market(session, data_path)
            print(f"\nAEI labor market ingestion complete:")
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
    parser = argparse.ArgumentParser(description="Ingest AEI labor market data")
    parser.add_argument("--path", default=DEFAULT_PATH, help=f"Data directory (default: {DEFAULT_PATH})")
    args = parser.parse_args()
    asyncio.run(main(args.path))
