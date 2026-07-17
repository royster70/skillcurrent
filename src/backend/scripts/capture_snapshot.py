"""CLI script to capture a snapshot of the platform's derived readings (ADR-012).

Runs as the terminal `snapshot_derived_products` pipeline stage, and can be run
by hand to take an ad-hoc or a labelled-release snapshot.

Usage:
    python -m scripts.capture_snapshot                       # ad-hoc, today
    python -m scripts.capture_snapshot --label 2026-Q3 --release
    python -m scripts.capture_snapshot --as-of 2026-07-17
"""

import argparse
import asyncio
import logging

from app.db.session import async_session
from app.services.snapshot_capture import capture_snapshot

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(
    as_of_iso: str | None = None, label: str | None = None, is_release: bool = False
) -> int:
    """Capture a snapshot. Returns the number of verdict rows written."""
    async with async_session() as session:
        rows = await capture_snapshot(
            session, as_of_iso=as_of_iso, label=label, is_release=is_release
        )
        await session.commit()
    print(f"\nSnapshot captured: {rows:,} verdict rows")
    return rows


async def main(as_of_iso: str | None, label: str | None, is_release: bool) -> None:
    await run(as_of_iso=as_of_iso, label=label, is_release=is_release)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Capture a derived-readings snapshot")
    parser.add_argument("--as-of", dest="as_of", default=None, help="ISO date (default: today)")
    parser.add_argument("--label", default=None, help="Release label, e.g. 2026-Q3")
    parser.add_argument("--release", action="store_true", help="Mark this snapshot a release")
    args = parser.parse_args()
    asyncio.run(main(args.as_of, args.label, args.release))
