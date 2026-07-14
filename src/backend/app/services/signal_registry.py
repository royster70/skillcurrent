"""Query helpers for the signal source registry (FR-9.5).

Thin read helpers over ``signal_source_registry`` used by the seed-inclusion
filter and any endpoint that surfaces per-source licence/provenance. Kept
trivial on purpose — the schema is the source of truth (Rule 5: data dominates).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def redistributable_keys(session: AsyncSession) -> set[str]:
    """Source keys that may be bundled/exported/served (``redistribution_ok``)."""
    r = await session.execute(
        text("SELECT source_key FROM signal_source_registry WHERE redistribution_ok = true")
    )
    return {row[0] for row in r.fetchall()}


async def restricted_sources(session: AsyncSession) -> list[dict[str, Any]]:
    """Consumed-only sources — cite/link only, never redistributed."""
    r = await session.execute(
        text(
            "SELECT source_key, source_name, licence, status FROM signal_source_registry "
            "WHERE redistribution_ok = false ORDER BY source_key"
        )
    )
    return [
        {"source_key": k, "source_name": n, "licence": lic, "status": s}
        for k, n, lic, s in r.fetchall()
    ]


async def all_sources(session: AsyncSession) -> list[dict[str, Any]]:
    """Full registry, ordered by key (for a /signals endpoint or NOTICE export)."""
    r = await session.execute(
        text(
            "SELECT source_key, source_name, publisher, dataset, licence, "
            "redistribution_ok, native_grain, source_url, status, notes "
            "FROM signal_source_registry ORDER BY redistribution_ok DESC, source_key"
        )
    )
    cols = (
        "source_key",
        "source_name",
        "publisher",
        "dataset",
        "licence",
        "redistribution_ok",
        "native_grain",
        "source_url",
        "status",
        "notes",
    )
    return [dict(zip(cols, row, strict=True)) for row in r.fetchall()]
