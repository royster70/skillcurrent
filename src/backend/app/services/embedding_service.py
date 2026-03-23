"""Embedding service for Layer 2 semantic matching.

Embeds O*NET titles and occupation descriptions using all-MiniLM-L6-v2
(384 dimensions) and stores them in pgvector for cosine similarity search.

Sources embedded:
  - 7,953 sample titles
  - 57,543 alternate titles
  - 1,016 occupation descriptions (title + description combined)

Total: ~66,500 embeddings
"""

import logging

from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
BATCH_SIZE = 512


def _get_model() -> SentenceTransformer:
    """Load sentence transformer model (cached after first call)."""
    return SentenceTransformer(MODEL_NAME)


async def embed_all_titles(session: AsyncSession) -> dict[str, int]:
    """Embed all O*NET titles and occupation descriptions into pgvector.

    Returns dict with counts per source type.
    """
    logger.info("Loading sentence-transformers model: %s", MODEL_NAME)
    model = _get_model()

    # Clear existing embeddings
    await session.execute(text("DELETE FROM onet_title_embeddings"))
    await session.flush()

    counts: dict[str, int] = {}

    # 1. Sample titles
    logger.info("Embedding sample titles...")
    r = await session.execute(text(
        "SELECT onet_soc, reported_job_title FROM onet_sample_titles"
    ))
    sample_rows = r.fetchall()
    counts["sample"] = await _embed_batch(
        session, model, [(row[0], row[1], "sample") for row in sample_rows]
    )
    logger.info("  %d sample titles embedded", counts["sample"])

    # 2. Alternate titles
    logger.info("Embedding alternate titles...")
    r = await session.execute(text(
        "SELECT onet_soc, alternate_title FROM onet_alternate_titles"
    ))
    alt_rows = r.fetchall()
    counts["alternate"] = await _embed_batch(
        session, model, [(row[0], row[1], "alternate") for row in alt_rows]
    )
    logger.info("  %d alternate titles embedded", counts["alternate"])

    # 3. Occupation descriptions (title + description combined for richer embedding)
    logger.info("Embedding occupation descriptions...")
    r = await session.execute(text(
        "SELECT onet_soc, title || ': ' || COALESCE(description, '') FROM onet_occupations"
    ))
    occ_rows = r.fetchall()
    counts["occupation"] = await _embed_batch(
        session, model, [(row[0], row[1], "occupation") for row in occ_rows]
    )
    logger.info("  %d occupation descriptions embedded", counts["occupation"])

    await session.commit()

    total = sum(counts.values())
    logger.info("Embedding complete: %d total embeddings stored", total)
    return counts


async def _embed_batch(
    session: AsyncSession,
    model: SentenceTransformer,
    rows: list[tuple[str, str, str]],  # (onet_soc, text, source)
) -> int:
    """Embed a batch of texts and insert into onet_title_embeddings."""
    if not rows:
        return 0

    texts = [row[1] for row in rows]

    # Encode in batches
    total = 0
    for i in range(0, len(texts), BATCH_SIZE):
        batch_texts = texts[i : i + BATCH_SIZE]
        batch_rows = rows[i : i + BATCH_SIZE]

        embeddings = model.encode(batch_texts, show_progress_bar=False)

        # Insert with pgvector
        insert_sql = text(
            "INSERT INTO onet_title_embeddings (onet_soc, title, source, embedding) "
            "VALUES (:soc, :title, :source, :embedding)"
        )

        params = [
            {
                "soc": row[0],
                "title": row[1],
                "source": row[2],
                "embedding": f"[{','.join(str(x) for x in emb)}]",
            }
            for row, emb in zip(batch_rows, embeddings)
        ]

        await session.execute(insert_sql, params)
        total += len(params)

        if total % 5000 == 0:
            logger.info("    %d / %d embedded...", total, len(rows))

    return total


async def search_by_embedding(
    session: AsyncSession,
    query: str,
    limit: int = 20,
    source_filter: str | None = None,
) -> list[dict]:
    """Search for nearest O*NET titles/occupations by semantic similarity.

    Args:
        query: Search text (job title or description).
        limit: Max results.
        source_filter: Optional filter: 'sample', 'alternate', 'occupation', or None for all.

    Returns:
        List of dicts with title, soc_code, source, similarity.
    """
    model = _get_model()
    query_embedding = model.encode([query])[0]
    embedding_str = f"[{','.join(str(x) for x in query_embedding)}]"

    source_clause = ""
    params: dict = {"embedding": embedding_str, "limit": limit}
    if source_filter:
        source_clause = "AND te.source = :source"
        params["source"] = source_filter

    r = await session.execute(text(f"""
        SELECT te.title, te.onet_soc, te.source,
               1 - (te.embedding <=> CAST(:embedding AS vector)) AS similarity,
               o.title AS occupation_title
        FROM onet_title_embeddings te
        JOIN onet_occupations o ON o.onet_soc = te.onet_soc
        WHERE te.embedding IS NOT NULL {source_clause}
        ORDER BY te.embedding <=> CAST(:embedding AS vector)
        LIMIT :limit
    """), params)

    return [
        {
            "matched_title": row[0],
            "soc_code": row[1],
            "source": row[2],
            "similarity": round(float(row[3]), 4),
            "occupation_title": row[4],
        }
        for row in r.fetchall()
    ]
