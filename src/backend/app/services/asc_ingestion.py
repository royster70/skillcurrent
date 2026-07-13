"""ASC v3.0 ingestion service (FR-9.2, ADR-011).

Reads the three Australian Skills Classification layers from the `strayr`
package `.rda` files (via pyreadr) and loads them:

  - asc_specialist_tasks.rda   -> asc_specialist_task
  - asc_core_competencies.rda  -> asc_core_competency
  - asc_technology_tools.rda   -> asc_technology_tool

The published files carry NO source-DWA column (Phase B0), so `source_dwa_id`
is left NULL; the DWA→ASC bridge is built semantically in a later step.

Registers the version in dataset_versions (ADR-002). Idempotent: clears the
three ASC tables + prior asc dataset_version row before loading.
"""

import logging
from pathlib import Path
from typing import Any

import pyreadr  # type: ignore[import-not-found,import-untyped,unused-ignore]
from sqlalchemy import delete, insert, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion, DatasetVersionDelta
from app.utils.hashing import compute_files_hash

logger = logging.getLogger(__name__)

# (rda filename, target table, source-col -> db-col mapping)
_LAYERS: list[tuple[str, str, dict[str, str]]] = [
    (
        "asc_specialist_tasks.rda",
        "asc_specialist_task",
        {
            "anzsco_code": "anzsco_code",
            "anzsco_name": "anzsco_name",
            "specialist_task": "specialist_task",
            "percent_of_time_spent_on_task": "percent_of_time_spent_on_task",
            "specialist_cluster": "specialist_cluster",
            "percent_of_time_spent_on_cluster": "percent_of_time_spent_on_cluster",
            "cluster_family": "cluster_family",
            "percent_of_time_spent_on_family": "percent_of_time_spent_on_family",
        },
    ),
    (
        "asc_core_competencies.rda",
        "asc_core_competency",
        {
            "anzsco_code": "anzsco_code",
            "anzsco_name": "anzsco_name",
            "core_competencies": "core_competency",
            "score": "score",
            "proficiency_level": "proficiency_level",
            "anchor_value": "anchor_value",
        },
    ),
    (
        "asc_technology_tools.rda",
        "asc_technology_tool",
        {
            "anzsco_code": "anzsco_code",
            "anzsco_name": "anzsco_name",
            "technology_tool": "technology_tool",
        },
    ),
]


def _read_layer(path: Path, col_map: dict[str, str]) -> list[dict[str, Any]]:
    """Read one .rda file, rename/select columns, return list of row dicts."""
    result = pyreadr.read_r(str(path))
    df = result[list(result.keys())[0]]
    available = {src: dst for src, dst in col_map.items() if src in df.columns}
    df = df[list(available.keys())].rename(columns=available)
    df = df.where(df.notna(), None)
    rows: list[dict[str, Any]] = df.to_dict("records")
    for r in rows:
        for k, v in r.items():
            if hasattr(v, "item"):  # numpy scalar -> python native
                r[k] = v.item()
    return rows


async def _bulk_insert(
    session: AsyncSession, table: str, rows: list[dict[str, Any]], version: str
) -> int:
    if not rows:
        return 0
    for r in rows:
        r["asc_version"] = version
    cols = list(rows[0].keys())
    sql = text(
        f"INSERT INTO {table} ({', '.join(cols)}) " f"VALUES ({', '.join(f':{c}' for c in cols)})"
    )
    for i in range(0, len(rows), 5000):
        await session.execute(sql, rows[i : i + 5000])
    return len(rows)


async def ingest_asc(session: AsyncSession, data_path: str, version: str = "3.0") -> dict[str, int]:
    """Ingest the 3 ASC layers from `.rda` files. Returns per-table row counts."""
    path = Path(data_path)
    files = [path / fname for fname, _, _ in _LAYERS]
    for fp in files:
        if not fp.exists():
            raise FileNotFoundError(f"ASC file missing: {fp}")

    integrity_hash = compute_files_hash(files)
    logger.info("Reading ASC layers from %s", data_path)
    parsed = {table: _read_layer(path / fname, cmap) for fname, table, cmap in _LAYERS}
    total = sum(len(rows) for rows in parsed.values())

    # Idempotent clear (deltas before version row — FK order).
    for table in parsed:
        await session.execute(text(f"DELETE FROM {table}"))
    await session.execute(
        delete(DatasetVersionDelta).where(DatasetVersionDelta.dataset_name == "asc")
    )
    await session.execute(delete(DatasetVersion).where(DatasetVersion.dataset_name == "asc"))

    version_id = (
        await session.execute(
            insert(DatasetVersion)
            .values(
                dataset_name="asc",
                version_key=version,
                row_count=total,
                integrity_hash=integrity_hash,
                source_url="https://www.jobsandskills.gov.au/data/australian-skills-classification",
                metadata_={
                    "source": "strayr package (runapp-aus)",
                    "counts": {t: len(r) for t, r in parsed.items()},
                    "note": "no source-DWA column (B0); bridge is semantic (ADR-011)",
                },
            )
            .returning(DatasetVersion.id)
        )
    ).scalar_one()
    await session.flush()

    counts = {
        table: await _bulk_insert(session, table, rows, version) for table, rows in parsed.items()
    }

    await session.execute(
        insert(DatasetVersionDelta).values(
            dataset_name="asc",
            from_version_id=None,
            to_version_id=version_id,
            records_added=total,
            records_removed=0,
            records_changed=0,
            delta_detail={"type": "initial_load", "tables": counts},
        )
    )
    await session.commit()
    logger.info("ASC %s ingestion complete: %s", version, counts)
    return counts
