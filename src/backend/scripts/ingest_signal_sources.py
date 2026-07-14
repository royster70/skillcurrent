"""Ingest the signal source registry from the committed CSV (FR-9.5).

``src/backend/data/signal_sources/signals.csv`` is the curated source of truth:
one row per external data source with a ``redistribution_ok`` flag. This script
loads it into ``signal_source_registry`` — the enforcement spine for the
open-source redistribution gate (seed-inclusion filter + pre-publish check).

Idempotent (upsert on ``source_key``) and hash-guarded: registers a
``dataset_versions`` row (ADR-002) and skips re-load when the CSV is unchanged.

Usage:
    python -m scripts.ingest_signal_sources
    python -m scripts.ingest_signal_sources --path /some/other/dir
    python -m scripts.ingest_signal_sources --force   # ignore the hash guard
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.utils.hashing import compute_files_hash  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ingest_signal_sources")

DATASET_NAME = "signal_source_registry"
REGISTRY_VERSION = "2026.07.1"
DATASET_DIR = Path(__file__).resolve().parent.parent / "data" / "signal_sources"
REQUIRED_COLUMNS = {
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
}
_TRUE = {"true", "1", "yes", "y", "t"}


def _csv_files(data_dir: Path) -> list[Path]:
    """Real registry CSVs (skip `_`-prefixed docs/templates)."""
    return sorted(p for p in data_dir.glob("*.csv") if not p.name.startswith("_"))


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip()
    return v or None


def _read_rows(path: Path) -> list[dict[str, Any]]:
    """Read + validate the registry CSV into DB-ready row dicts."""
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        header = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - header
        if missing:
            raise ValueError(f"{path.name}: missing columns {sorted(missing)}")
        rows: list[dict[str, Any]] = []
        for i, raw in enumerate(reader, start=2):  # line 2 = first data row
            key = (raw.get("source_key") or "").strip()
            name = (raw.get("source_name") or "").strip()
            licence = (raw.get("licence") or "").strip()
            if not key:
                logger.warning("%s line %d: blank source_key — skipped", path.name, i)
                continue
            if not name or not licence:
                raise ValueError(f"{path.name} line {i}: source_name and licence are required")
            rows.append(
                {
                    "source_key": key,
                    "source_name": name,
                    "publisher": _clean(raw.get("publisher")),
                    "dataset": _clean(raw.get("dataset")),
                    "licence": licence,
                    "redistribution_ok": (raw.get("redistribution_ok") or "").strip().lower()
                    in _TRUE,
                    "native_grain": _clean(raw.get("native_grain")),
                    "source_url": _clean(raw.get("source_url")),
                    "status": _clean(raw.get("status")),
                    "notes": _clean(raw.get("notes")),
                }
            )
    return rows


async def _hash_already_ingested(session: AsyncSession, integrity_hash: str) -> bool:
    r = await session.execute(
        text(
            "SELECT 1 FROM dataset_versions "
            "WHERE dataset_name = :name AND integrity_hash = :hash LIMIT 1"
        ),
        {"name": DATASET_NAME, "hash": integrity_hash},
    )
    return r.first() is not None


async def _upsert_rows(
    session: AsyncSession, rows: list[dict[str, Any]], integrity_hash: str
) -> int:
    upserted = 0
    for row in rows:
        await session.execute(
            text(
                """
                INSERT INTO signal_source_registry
                    (source_key, source_name, publisher, dataset, licence,
                     redistribution_ok, native_grain, source_url, status, notes,
                     registry_version, integrity_hash)
                VALUES
                    (:source_key, :source_name, :publisher, :dataset, :licence,
                     :redistribution_ok, :native_grain, :source_url, :status, :notes,
                     :registry_version, :integrity_hash)
                ON CONFLICT (source_key) DO UPDATE SET
                    source_name = EXCLUDED.source_name,
                    publisher = EXCLUDED.publisher,
                    dataset = EXCLUDED.dataset,
                    licence = EXCLUDED.licence,
                    redistribution_ok = EXCLUDED.redistribution_ok,
                    native_grain = EXCLUDED.native_grain,
                    source_url = EXCLUDED.source_url,
                    status = EXCLUDED.status,
                    notes = EXCLUDED.notes,
                    registry_version = EXCLUDED.registry_version,
                    integrity_hash = EXCLUDED.integrity_hash
                """
            ),
            {**row, "registry_version": REGISTRY_VERSION, "integrity_hash": integrity_hash},
        )
        upserted += 1
    return upserted


async def _register_version(
    session: AsyncSession, integrity_hash: str, rows: list[dict[str, Any]]
) -> None:
    redistributable = sum(1 for r in rows if r["redistribution_ok"])
    await session.execute(
        text(
            """
            INSERT INTO dataset_versions
                (dataset_name, version_key, row_count, integrity_hash, source_url, metadata)
            VALUES (:name, :vkey, :rows, :hash, :url, CAST(:meta AS jsonb))
            """
        ),
        {
            "name": DATASET_NAME,
            "vkey": REGISTRY_VERSION,
            "rows": len(rows),
            "hash": integrity_hash,
            "url": "internal:curated from docs/data-sources.md + NOTICE",
            "meta": json.dumps(
                {
                    "redistributable": redistributable,
                    "restricted": len(rows) - redistributable,
                    "registry_version": REGISTRY_VERSION,
                }
            ),
        },
    )


async def run(data_path: str | None = None, force: bool = False) -> int:
    """Load the signal source registry CSV. Returns rows upserted."""
    data_dir = Path(data_path) if data_path else DATASET_DIR
    files = _csv_files(data_dir)
    if not files:
        logger.warning("No registry CSV in %s — nothing to ingest.", data_dir)
        return 0

    integrity_hash = compute_files_hash(files)
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as session:
            if not force and await _hash_already_ingested(session, integrity_hash):
                logger.info("Registry CSV unchanged (hash match) — skipping. Use --force.")
                return 0

            all_rows: list[dict[str, Any]] = []
            for path in files:
                rows = _read_rows(path)
                all_rows.extend(rows)
                logger.info("%s: %d source rows", path.name, len(rows))
            if not all_rows:
                logger.warning("No loadable rows.")
                return 0

            upserted = await _upsert_rows(session, all_rows, integrity_hash)
            await _register_version(session, integrity_hash, all_rows)
            await session.commit()
            redistributable = sum(1 for r in all_rows if r["redistribution_ok"])
            logger.info(
                "Registry loaded: %d sources (%d redistributable, %d restricted).",
                upserted,
                redistributable,
                upserted - redistributable,
            )
            return upserted
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest the signal source registry from CSV")
    parser.add_argument("--path", default=None, help="Override the dataset directory")
    parser.add_argument("--force", action="store_true", help="Ignore the hash guard and reload")
    args = parser.parse_args()
    try:
        total = asyncio.run(run(data_path=args.path, force=args.force))
    except (ValueError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"\nSignal sources ingested: {total:,} rows")


if __name__ == "__main__":
    main()
