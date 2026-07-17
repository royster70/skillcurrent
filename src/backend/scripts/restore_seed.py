"""Restore the redistributable seed dataset (FR-9.5 P2) into Postgres.

One-command companion to ``build_seed.py``: reads ``data/seed/manifest.json``
and the Parquet files alongside it, and bulk-inserts each table. Preserves
original primary-key values (so cross-table references like
``gdpval_rubric_items.task_id`` stay valid) and resets each table's serial
sequence afterward so subsequent app/ingest writes don't collide with seeded
ids.

Precondition: the schema must already exist (``alembic upgrade head``).

Usage:
    python -m scripts.restore_seed
    python -m scripts.restore_seed --seed-dir /some/other/dir
    python -m scripts.restore_seed --truncate   # clear target tables first
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from scripts.ingest_signal_sources import run as ingest_signal_sources  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("restore_seed")

DEFAULT_SEED_DIR = Path(__file__).resolve().parent.parent / "data" / "seed"
_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
CHUNK_SIZE = 500

# Tables with a hard FK to another seed table (see the FK graph queried against
# the live DB) must restore after their parent. Everything else has no
# DB-enforced FK to another seed table and can follow in any order.
PARENTS_FIRST = ["onet_occupations", "gdpval_tasks", "snapshot_runs"]


def _validate_identifier(name: str) -> None:
    if not _IDENTIFIER.match(name):
        raise ValueError(f"unsafe table name: {name!r}")


def _row_dicts(df: pd.DataFrame) -> list[dict[str, Any]]:
    df = df.astype(object).where(df.notna(), None)
    records = []
    for row in df.to_dict("records"):
        clean = {}
        for key, value in row.items():
            if hasattr(value, "tolist"):
                value = value.tolist()
            # JSONB objects arrive as dicts; asyncpg's jsonb codec needs the
            # JSON text, not a dict. (Lists are left alone — those are native
            # Postgres ARRAY columns, which asyncpg binds directly. No shipped
            # JSONB column holds a top-level array.)
            if isinstance(value, dict):
                value = json.dumps(value)
            clean[key] = value
        records.append(clean)
    return records


async def _restore_table(session: AsyncSession, table: str, seed_dir: Path, truncate: bool) -> int:
    _validate_identifier(table)
    df = pd.read_parquet(seed_dir / f"{table}.parquet", engine="pyarrow")
    if df.empty:
        logger.info("%s: 0 rows in seed -- skipped", table)
        return 0

    if truncate:
        await session.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))

    columns = list(df.columns)
    col_list = ", ".join(f'"{c}"' for c in columns)
    param_list = ", ".join(f":{c}" for c in columns)
    insert_sql = text(f'INSERT INTO "{table}" ({col_list}) VALUES ({param_list})')

    records = _row_dicts(df)
    for i in range(0, len(records), CHUNK_SIZE):
        await session.execute(insert_sql, records[i : i + CHUNK_SIZE])

    if "id" in columns:
        await session.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f'GREATEST((SELECT COALESCE(MAX(id), 0) FROM "{table}"), 1))'
            )
        )
    return len(records)


async def run(seed_dir: str | None = None, truncate: bool = False) -> int:
    """Restore every table in the seed manifest. Returns total rows inserted."""
    seed_path = Path(seed_dir) if seed_dir else DEFAULT_SEED_DIR
    manifest_path = seed_path / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"no manifest.json in {seed_path} -- run build_seed.py first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    table_names = list(manifest["tables"].keys())
    ordered = [t for t in PARENTS_FIRST if t in table_names] + [
        t for t in table_names if t not in PARENTS_FIRST
    ]

    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as session:
            total = 0
            for table in ordered:
                rows = await _restore_table(session, table, seed_path, truncate)
                total += rows
                logger.info("%s: %d rows restored", table, rows)
            await session.commit()

        # No --force: the registry's own hash-guard already makes repeat calls
        # idempotent (skips when the CSV is unchanged), and --truncate only
        # clears the seed's own tables, not signal_source_registry itself.
        registry_rows = await ingest_signal_sources()
        logger.info("signal_source_registry: %d rows restored", registry_rows)

        logger.info("Seed restored: %d rows across %d tables.", total, len(ordered))
        return total
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Restore the redistributable seed dataset (FR-9.5)"
    )
    parser.add_argument("--seed-dir", default=None, help="Override the seed directory")
    parser.add_argument(
        "--truncate", action="store_true", help="Truncate target tables before inserting"
    )
    args = parser.parse_args()
    try:
        total = asyncio.run(run(seed_dir=args.seed_dir, truncate=args.truncate))
    except (ValueError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"\nSeed dataset restored: {total:,} rows")


if __name__ == "__main__":
    main()
