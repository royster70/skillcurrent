"""CLI to build the semantic DWA<->ASC bridge (FR-9.2, ADR-011 L2).

Requires O*NET DWAs and ASC ingested. Embeds both sides (all-MiniLM-L6-v2) and
records top-k nearest DWA per ASC specialist task (cosine floor 0.60).

Usage:
    python -m scripts.build_dwa_asc_bridge
"""

import asyncio
import logging

from app.db.session import async_session
from app.services.dwa_asc_bridge import build_dwa_asc_bridge

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def main() -> None:
    async with async_session() as session:
        stats = await build_dwa_asc_bridge(session)
        print("\nDWA<->ASC bridge built:")
        print(f"  matches:        {stats['matches']:,}")
        print(f"  ASC tasks matched: {stats['tasks_matched']:,} / {stats['tasks_total']:,}")
        print(f"  DWAs used:      {stats['dwas_used']:,}")
        cov = 100 * stats["tasks_matched"] / stats["tasks_total"] if stats["tasks_total"] else 0
        print(f"  task coverage:  {cov:.1f}%")


if __name__ == "__main__":
    asyncio.run(main())
