"""CLI script to derive Eloundou DWA-level scores from occupation-level.

Usage:
    python -m scripts.derive_eloundou_dwas
"""

import asyncio
import logging

from app.db.session import async_session
from app.services.eloundou_dwa_derivation import derive_eloundou_dwa_scores

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run() -> int:
    """Derive Eloundou DWA-level scores. Returns rows created."""
    async with async_session() as session:
        rows = await derive_eloundou_dwa_scores(session)
        await session.commit()
    print(f"\nEloundou DWA derivation complete: {rows:,} DWA-level scores created")
    return rows


async def main() -> None:
    await run()


if __name__ == "__main__":
    asyncio.run(main())
