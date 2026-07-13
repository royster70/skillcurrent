"""CLI script to embed all O*NET titles for semantic search.

Usage:
    python -m scripts.embed_titles
"""

import asyncio
import logging

from app.db.session import async_session
from app.services.embedding_service import embed_all_titles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run() -> int:
    """Embed all O*NET sample + alternate titles. Returns total embeddings."""
    async with async_session() as session:
        counts = await embed_all_titles(session)
    total = sum(counts.values())
    print("\nEmbedding complete:")
    for source, count in counts.items():
        print(f"  {source}: {count:,}")
    print(f"  TOTAL: {total:,}")
    return total


async def main() -> None:
    await run()


if __name__ == "__main__":
    asyncio.run(main())
