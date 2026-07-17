"""CLI to ingest JSA "Our Gen AI Transition" AU-native exposure (FR-9.x).

Usage:
    python -m scripts.ingest_jsa_genai
    python -m scripts.ingest_jsa_genai --data-path /custom/JSA-GenAI
    python -m scripts.ingest_jsa_genai --version 2025.08
"""

import argparse
import asyncio
import logging

from app.core.config import settings
from app.db.session import async_session
from app.services.jsa_ingestion import ingest_jsa_genai

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(data_path: str | None = None, version: str = "2025.08") -> int:
    """Ingest the JSA Gen AI exposure CSV. Returns rows loaded."""
    path = data_path or settings.jsa_genai_data_path
    async with async_session() as session:
        rows = await ingest_jsa_genai(session, path, version=version)
        await session.commit()
    print(f"\nJSA Gen AI ingestion complete: {rows:,} ANZSCO rows")
    return rows


async def main(data_path: str | None, version: str) -> None:
    await run(data_path=data_path, version=version)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest JSA Gen AI exposure")
    parser.add_argument("--data-path", default=None, help="Override the JSA-GenAI dir")
    parser.add_argument("--version", default="2025.08", help="Release version key")
    args = parser.parse_args()
    asyncio.run(main(args.data_path, args.version))
