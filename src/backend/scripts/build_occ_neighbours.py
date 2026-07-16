"""Precompute "similar occupations" neighbours from title embeddings (P4).

Writes ``data/static/neighbours.json`` — one committed, git-tracked artifact
mapping each O*NET SOC to its top-K most semantically similar occupations. The
static site ships this so "similar occupations" works with zero runtime vector
math (no transformers.js, no embeddings payload).

This is the ONE static artifact that needs ``onet_title_embeddings`` (66k
vectors, deliberately excluded from the seed as the largest table). So it is
precomputed ONCE here against a full local DB and committed; the static-site
build (``build_static_site.py``) and the CI deploy just copy the committed
file — CI never needs the embeddings.

Derived purely from O*NET titles (public domain) + all-MiniLM-L6-v2
(Apache-2.0), so it is redistributable (source_key ``onet``).

Usage (needs a full DB with onet_title_embeddings populated):
    python -m scripts.build_occ_neighbours
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-5s %(message)s", datefmt="%H:%M:%S"
)
logger = logging.getLogger("build_occ_neighbours")

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "static" / "neighbours.json"
TOP_K = 8


async def _load_centroids() -> tuple[list[str], np.ndarray]:
    """Return (soc_codes, unit-normalised centroid matrix) from title embeddings."""
    engine = create_async_engine(settings.database_url)
    sums: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(0))
    counts: dict[str, int] = defaultdict(int)
    try:
        async with engine.connect() as conn:
            # embedding::text is pgvector's '[a,b,...]' form — valid JSON.
            result = await conn.stream(
                text("SELECT onet_soc, embedding::text FROM onet_title_embeddings")
            )
            async for soc, emb_text in result:
                vec = np.asarray(json.loads(emb_text), dtype=np.float32)
                if counts[soc] == 0:
                    sums[soc] = vec.copy()
                else:
                    sums[soc] += vec
                counts[soc] += 1
    finally:
        await engine.dispose()

    socs = sorted(sums)
    if not socs:
        raise RuntimeError("onet_title_embeddings is empty — run against a full DB (not the seed).")
    mat = np.vstack([sums[s] / counts[s] for s in socs])
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return socs, mat / norms


def _top_k(socs: list[str], unit: np.ndarray) -> dict[str, list[list[object]]]:
    """Cosine top-K per SOC (excluding self), as {soc: [[neighbour_soc, score], ...]}."""
    sims = unit @ unit.T  # cosine, since rows are unit-normalised
    np.fill_diagonal(sims, -1.0)  # exclude self
    out: dict[str, list[list[object]]] = {}
    for i, soc in enumerate(socs):
        idx = np.argpartition(sims[i], -TOP_K)[-TOP_K:]
        idx = idx[np.argsort(sims[i][idx])[::-1]]
        out[soc] = [[socs[j], round(float(sims[i][j]), 3)] for j in idx]
    return out


async def run() -> int:
    logger.info("Loading title embeddings and computing SOC centroids...")
    socs, unit = await _load_centroids()
    logger.info("  %d occupations with embeddings", len(socs))
    neighbours = _top_k(socs, unit)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(neighbours, separators=(",", ":")) + "\n", encoding="utf-8")
    logger.info("Wrote %d neighbour lists -> %s", len(neighbours), OUT_PATH)
    return len(neighbours)


def main() -> None:
    total = asyncio.run(run())
    print(f"\nNeighbours precomputed for {total:,} occupations")


if __name__ == "__main__":
    main()
