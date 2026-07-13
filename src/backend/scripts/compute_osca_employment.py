"""CLI to apportion AU employment ANZSCO -> OSCA (FR-9.1, ADR-010).

Requires OSCA ingested first (scripts.ingest_osca).

Usage:
    python -m scripts.compute_osca_employment
"""

import argparse
import asyncio
import logging

from app.db.session import async_session
from app.services.osca_apportionment import compute_osca_employment

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(version: str = "2024.1.0") -> int:
    """Apportion AU employment ANZSCO→OSCA. Returns rows written.

    Shared entry point for the CLI and the pipeline orchestrator.
    """
    async with async_session() as session:
        stats = await compute_osca_employment(session, version)
    print("\nOSCA employment apportionment complete:")
    print(f"  rows written:        {int(stats['rows']):,}")
    print(f"  OSCA occupations:    {int(stats['osca_occupations']):,}")
    print(f"  apportioned emp:     {int(stats['apportioned_employment']):,}")
    print(f"  base emp (dedup):    {int(stats['base_employment']):,}")
    diff = stats["apportioned_employment"] - stats["base_employment"]
    print(f"  reconciliation diff: {diff:+.1f} (must be ~0)")
    return int(stats["rows"])


async def main(version: str) -> None:
    await run(version)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Apportion AU employment ANZSCO->OSCA")
    parser.add_argument("--version", default="2024.1.0", help="OSCA version key")
    args = parser.parse_args()
    asyncio.run(main(args.version))
