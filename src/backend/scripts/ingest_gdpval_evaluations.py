"""Ingest GDPval model-era capability evaluations from the committed CSV dataset.

The paid eval (`compute_gdpval_waterline.py`) writes one CSV per model era into
`src/backend/data/gdpval_evaluations/` — a committed, git-backed source of truth
(see that directory's README). This script loads those CSVs into the
`gdpval_evaluations` table. Because the files are the durable artifact, a rebuild
re-runs this free ingest rather than the paid computation, and adding a new model
era is just dropping a new `<era>.csv` and re-running.

Idempotent (upsert on the `(task_id, model_era)` unique key) and hash-guarded:
registers a `dataset_versions` row (ADR-002) and skips re-load when the CSV set is
unchanged. Rows referencing a `task_id` absent from `gdpval_tasks` are skipped with
a warning (honest partial load rather than an FK crash).

Usage:
    python -m scripts.ingest_gdpval_evaluations
    python -m scripts.ingest_gdpval_evaluations --path /some/other/dir
    python -m scripts.ingest_gdpval_evaluations --force   # ignore the hash guard
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import logging
import sys
from datetime import date, datetime
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
logger = logging.getLogger("ingest_gdpval_evaluations")

DATASET_NAME = "gdpval_evaluations"
DATASET_DIR = Path(__file__).resolve().parent.parent / "data" / "gdpval_evaluations"
REQUIRED_COLUMNS = {
    "task_id",
    "model_era",
    "model_name",
    "evaluation_date",
    "total_score",
    "max_possible_score",
    "completion_pct",
    "notes",
}


def _era_files(data_dir: Path) -> list[Path]:
    """CSV files that are real per-era data (skip `_`-prefixed docs/templates)."""
    return sorted(p for p in data_dir.glob("*.csv") if not p.name.startswith("_"))


def _parse_float(value: str | None) -> float | None:
    if value is None or value.strip() == "":
        return None
    return float(value)


def _parse_date(value: str | None) -> date | None:
    if value is None or value.strip() == "":
        return None
    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


def _read_rows(path: Path) -> list[dict[str, Any]]:
    """Read + validate one era CSV into DB-ready row dicts."""
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        header = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - header
        if missing:
            raise ValueError(f"{path.name}: missing columns {sorted(missing)}")
        rows: list[dict[str, Any]] = []
        for i, raw in enumerate(reader, start=2):  # line 2 = first data row
            task_id = (raw.get("task_id") or "").strip()
            era = (raw.get("model_era") or "").strip()
            if not task_id or not era:
                logger.warning("%s line %d: blank task_id/model_era — skipped", path.name, i)
                continue
            rows.append(
                {
                    "task_id": task_id,
                    "era": era,
                    "model": (raw.get("model_name") or "").strip() or None,
                    "edate": _parse_date(raw.get("evaluation_date")),
                    "score": _parse_float(raw.get("total_score")),
                    "max_score": _parse_float(raw.get("max_possible_score")),
                    "pct": _parse_float(raw.get("completion_pct")),
                    "notes": (raw.get("notes") or "").strip() or None,
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


async def _known_task_ids(session: AsyncSession) -> set[str]:
    r = await session.execute(text("SELECT task_id FROM gdpval_tasks"))
    return {row[0] for row in r.fetchall()}


async def _upsert_rows(session: AsyncSession, rows: list[dict[str, Any]]) -> int:
    inserted = 0
    for row in rows:
        await session.execute(
            text(
                """
                INSERT INTO gdpval_evaluations
                    (task_id, model_era, model_name, evaluation_date,
                     total_score, max_possible_score, completion_pct, notes)
                VALUES
                    (:task_id, :era, :model, :edate,
                     :score, :max_score, :pct, :notes)
                ON CONFLICT (task_id, model_era) DO UPDATE SET
                    model_name = EXCLUDED.model_name,
                    evaluation_date = EXCLUDED.evaluation_date,
                    total_score = EXCLUDED.total_score,
                    max_possible_score = EXCLUDED.max_possible_score,
                    completion_pct = EXCLUDED.completion_pct,
                    notes = EXCLUDED.notes
                """
            ),
            row,
        )
        inserted += 1
    return inserted


async def _register_version(
    session: AsyncSession, files: list[Path], eras: list[str], integrity_hash: str, row_count: int
) -> None:
    version_key = "+".join(sorted(eras))
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
            "vkey": version_key,
            "rows": row_count,
            "hash": integrity_hash,
            "url": "internal:generated (compute_gdpval_waterline.py)",
            "meta": _json(
                {
                    "eras": sorted(eras),
                    "files": [f.name for f in files],
                    "judge_model": "claude-haiku-4-5 (held constant)",
                    "methodology": "text-evaluation proxy (not computer-use)",
                }
            ),
        },
    )


def _json(obj: dict[str, Any]) -> str:
    import json

    return json.dumps(obj)


async def run(data_path: str | None = None, force: bool = False) -> int:
    """Load the committed GDPval eval CSVs into gdpval_evaluations. Returns rows loaded."""
    data_dir = Path(data_path) if data_path else DATASET_DIR
    files = _era_files(data_dir)
    if not files:
        logger.warning("No era CSVs in %s (only the template?) — nothing to ingest.", data_dir)
        return 0

    integrity_hash = compute_files_hash(files)
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as session:
            if not force and await _hash_already_ingested(session, integrity_hash):
                logger.info("CSV set unchanged (hash match) — skipping. Use --force to reload.")
                return 0

            known = await _known_task_ids(session)
            if not known:
                logger.warning(
                    "gdpval_tasks is empty — every eval row is an orphan. Load tasks first."
                )

            all_rows: list[dict[str, Any]] = []
            eras: list[str] = []
            skipped_fk = 0
            for path in files:
                rows = _read_rows(path)
                era_of_file = path.stem
                eras.append(era_of_file)
                kept = [r for r in rows if r["task_id"] in known]
                skipped_fk += len(rows) - len(kept)
                all_rows.extend(kept)
                logger.info("%s: %d rows (%d kept)", path.name, len(rows), len(kept))

            if skipped_fk:
                logger.warning("%d rows skipped (task_id not in gdpval_tasks).", skipped_fk)
            if not all_rows:
                logger.warning("No loadable rows (all orphaned or empty).")
                return 0

            loaded = await _upsert_rows(session, all_rows)
            await _register_version(session, files, eras, integrity_hash, loaded)
            await session.commit()
            logger.info(
                "Loaded %d evaluations across %d era(s): %s",
                loaded,
                len(eras),
                ", ".join(sorted(eras)),
            )
            return loaded
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest GDPval model-era evaluations from CSV")
    parser.add_argument("--path", default=None, help="Override the dataset directory")
    parser.add_argument("--force", action="store_true", help="Ignore the hash guard and reload")
    args = parser.parse_args()
    try:
        total = asyncio.run(run(data_path=args.path, force=args.force))
    except (ValueError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"\nGDPval evaluations ingested: {total:,} rows")


if __name__ == "__main__":
    main()
