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


async def main() -> None:
    async with async_session() as session:
        counts = await embed_all_titles(session)
        print(f"\nEmbedding complete:")
        for source, count in counts.items():
            print(f"  {source}: {count:,}")
        print(f"  TOTAL: {sum(counts.values()):,}")


if __name__ == "__main__":
    asyncio.run(main())
