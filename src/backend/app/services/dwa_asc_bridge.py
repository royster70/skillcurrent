"""DWA<->ASC semantic bridge (FR-9.2, ADR-011 L2).

Embeds O*NET DWA titles and distinct ASC specialist-task texts with the same
all-MiniLM-L6-v2 stack used for Layer-2 matching, then records the top-k nearest
DWA per ASC task (cosine floor 0.60). This is the *measured* task-level rung —
ASC v3.0 exposes no source-DWA column (B0), so there is no L1 lookup.

Confidence = cosine similarity. Fidelity is high here (unlike OSCA main tasks)
because ASC specialist tasks are reworded DWAs, so the texts are close by
construction.
"""

import logging
from typing import Any

from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embedding_service import MODEL_NAME
from app.services.transformations import tracked_transformation

logger = logging.getLogger(__name__)

_BATCH = 512
_TOP_K = 3
_FLOOR = 0.60


def _vec(emb: Any) -> str:
    return f"[{','.join(str(x) for x in emb)}]"


async def _embed_into(
    session: AsyncSession,
    model: SentenceTransformer,
    table: str,
    text_col: str,
    id_col: str | None,
    rows: list[tuple[str, str]],  # (key, text)
) -> int:
    """Embed (key, text) rows into `table` (text_col + optional id_col + embedding)."""
    await session.execute(text(f"DELETE FROM {table}"))
    total = 0
    for i in range(0, len(rows), _BATCH):
        chunk = rows[i : i + _BATCH]
        embs = model.encode([t for _, t in chunk], show_progress_bar=False)
        cols = ([id_col] if id_col else []) + [text_col, "embedding"]
        col_sql = ", ".join(cols)
        val_sql = ", ".join(f":{c}" for c in cols)
        sql = text(f"INSERT INTO {table} ({col_sql}) VALUES ({val_sql})")
        params = []
        for (key, txt), emb in zip(chunk, embs):
            p = {text_col: txt, "embedding": _vec(emb)}
            if id_col:
                p[id_col] = key
            params.append(p)
        await session.execute(sql, params)
        total += len(params)
    return total


_MATCH_SQL = text(
    """
    INSERT INTO dwa_asc_bridge
        (specialist_task, dwa_id, cosine_similarity, confidence, method, rank)
    SELECT a.specialist_task, d.dwa_id, d.sim, d.sim, 'semantic', d.rn
    FROM asc_task_embeddings a
    CROSS JOIN LATERAL (
        SELECT e.dwa_id,
               1 - (e.embedding <=> a.embedding) AS sim,
               row_number() OVER (ORDER BY e.embedding <=> a.embedding) AS rn
        FROM dwa_embeddings e
        ORDER BY e.embedding <=> a.embedding
        LIMIT :topk
    ) d
    WHERE d.sim >= :floor
    """
)


@tracked_transformation(
    name="build_dwa_asc_bridge",
    sources=["onet_dwa_references", "asc_specialist_task"],
    target="dwa_asc_bridge",
)
async def _build(session: AsyncSession) -> int:
    """Embed both sides and populate dwa_asc_bridge; returns bridge rows."""
    model = SentenceTransformer(MODEL_NAME)

    dwas = [
        (r[0], r[1])
        for r in (
            await session.execute(
                text(
                    "SELECT DISTINCT dwa_id, dwa_title FROM onet_dwa_references "
                    "WHERE dwa_title IS NOT NULL"
                )
            )
        ).fetchall()
    ]
    logger.info("Embedding %d DWA titles...", len(dwas))
    await _embed_into(session, model, "dwa_embeddings", "dwa_title", "dwa_id", dwas)

    tasks = [
        (r[0], r[0])
        for r in (
            await session.execute(
                text(
                    "SELECT DISTINCT specialist_task FROM asc_specialist_task "
                    "WHERE specialist_task IS NOT NULL"
                )
            )
        ).fetchall()
    ]
    logger.info("Embedding %d distinct ASC specialist tasks...", len(tasks))
    await _embed_into(session, model, "asc_task_embeddings", "specialist_task", None, tasks)

    await session.execute(text("DELETE FROM dwa_asc_bridge"))
    await session.execute(_MATCH_SQL, {"topk": _TOP_K, "floor": _FLOOR})
    n = int((await session.execute(text("SELECT count(*) FROM dwa_asc_bridge"))).scalar_one())
    logger.info("Bridge built: %d (task, dwa) matches (top-%d, floor %.2f)", n, _TOP_K, _FLOOR)
    return n


async def build_dwa_asc_bridge(session: AsyncSession) -> dict[str, int]:
    """Build the semantic DWA<->ASC bridge. Returns summary stats."""
    await _build(session)
    stats = (
        await session.execute(
            text(
                """
                SELECT count(*) AS matches,
                       count(DISTINCT specialist_task) AS tasks_matched,
                       count(DISTINCT dwa_id) AS dwas_used
                FROM dwa_asc_bridge
                """
            )
        )
    ).one()
    total_tasks = int(
        (
            await session.execute(
                text("SELECT count(DISTINCT specialist_task) FROM asc_specialist_task")
            )
        ).scalar_one()
    )
    await session.commit()
    result = {
        "matches": int(stats.matches),
        "tasks_matched": int(stats.tasks_matched),
        "tasks_total": total_tasks,
        "dwas_used": int(stats.dwas_used),
    }
    logger.info("DWA-ASC bridge complete: %s", result)
    return result
