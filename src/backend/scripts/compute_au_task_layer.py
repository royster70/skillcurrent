"""CLI to populate the au_task layer + AU occupation exposure (FR-9.2, ADR-011).

Requires ASC ingested, the DWA<->ASC bridge built, and Eloundou DWA scores.

Usage:
    python -m scripts.compute_au_task_layer
"""

import asyncio
import logging

from app.db.session import async_session
from app.services.compute_au_task_layer import compute_au_task_layer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def main() -> None:
    async with async_session() as session:
        s = await compute_au_task_layer(session)
        print("\nAU task layer built:")
        print(f"  au_task rows:        {int(s['au_task_rows']):,}")
        print(f"  measured (T2):       {int(s['measured']):,}")
        print(f"  OSCA occupations:    {int(s['occupations']):,}")
        print(f"  avg occ coverage:    {s['avg_occupation_coverage_pct']}%")
        print(f"  avg occ AU beta:     {s['avg_occupation_au_beta']}")


if __name__ == "__main__":
    asyncio.run(main())
