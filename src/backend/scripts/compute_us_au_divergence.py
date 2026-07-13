"""CLI to compute US-vs-AU occupation exposure divergence (FR-9.2).

Requires the au_task layer (au_occupation_exposure) + O*NET + Eloundou DWA.

Usage:
    python -m scripts.compute_us_au_divergence
"""

import asyncio
import logging

from app.db.session import async_session
from app.services.compute_us_au_divergence import compute_us_au_divergence

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run() -> int:
    """Compute US-vs-AU occupation exposure divergence. Returns occupations covered.

    Shared entry point for the CLI and the pipeline orchestrator.
    """
    async with async_session() as session:
        s = await compute_us_au_divergence(session)
    print("\nUS-vs-AU divergence computed:")
    print(f"  occupations:       {int(s['occupations']):,}")
    print(f"  with divergence:   {int(s['with_divergence']):,}")
    print(f"  avg divergence:    {s['avg_divergence']:+.4f} (US minus AU)")
    print(f"  avg |divergence|:  {s['avg_abs_divergence']:.4f}")
    return int(s["occupations"])


async def main() -> None:
    await run()


if __name__ == "__main__":
    asyncio.run(main())
