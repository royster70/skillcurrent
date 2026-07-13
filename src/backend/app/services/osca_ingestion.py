"""OSCA 2024 v1.0 ingestion service (FR-9.1, Phase A).

Parses the ABS OSCA data downloads (4 .xlsx workbooks) and loads the AU
occupation backbone + correspondences:

  - osca_occupations   <- "OSCA structure.xlsx"           Table 5 (hierarchy)
                          enriched with the Lead Statement from
                          "OSCA Category Descriptions.xlsx" Table 1
  - osca_main_tasks    <- "OSCA Category Descriptions.xlsx" Table 1 (Main Tasks)
  - osca_anzsco_map    <- "OSCA correspondence tables v2.xlsx" Table 2 (OSCA->ANZSCO v1.3)
  - osca_isco_map      <- "OSCA correspondence tables v2.xlsx" Table 8 (OSCA->ISCO-08)

ABS spreadsheets carry 4-5 preamble rows before the real header, and the
structure hierarchy is encoded by column position (col1=major .. col4=unit
group, col5=6-digit occupation). Correspondence tables forward-fill the OSCA
code (blank first column = continuation of the previous occupation's mapping)
and flag partial links with a 'p' in the relation column.

OSCA main tasks are GenAI-generated descriptors (descriptor_only=True) and are
NOT an exposure carrier — see docs/domain-model.md and the DWA-pivot ADR.

Registers the version in dataset_versions (ADR-002). Idempotent: clears the
four OSCA tables + prior osca dataset_version row before loading.
"""

import logging
from pathlib import Path
from typing import Any

import openpyxl
from sqlalchemy import delete, insert, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion, DatasetVersionDelta
from app.utils.hashing import compute_files_hash

logger = logging.getLogger(__name__)

_FILES = {
    "structure": "OSCA structure.xlsx",
    "descriptions": "OSCA Category Descriptions.xlsx",
    "correspondence": "OSCA correspondence tables v2.xlsx",
}

# Structure Table 5 column indices (0-based); hierarchy encoded by position.
_S_UNIT_GROUP = 3  # 4-digit unit group code
_S_OCC_CODE = 4  # 6-digit occupation code
_S_OCC_TITLE = 5
_S_HEADER_ROW = 5  # data starts at row 6

# Category Descriptions Table 1 column indices (0-based).
_D_CODE = 0
_D_LEAD = 3  # Lead Statement -> occupation description
_D_MAIN_TASKS = 8
_D_HEADER_ROW = 5

# Correspondence tables: OSCA code | OSCA title | target code | 'p' flag | target title
_C_OSCA = 0
_C_TARGET = 2
_C_FLAG = 3
_C_HEADER_ROW = 5


def _s(value: Any) -> str | None:
    """Coerce a cell to a stripped string, or None if empty."""
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _is_code(value: Any, length: int) -> bool:
    s = _s(value)
    return s is not None and s.isdigit() and len(s) == length


def _sheet_rows(path: Path, tab: str, start_row: int) -> list[tuple[Any, ...]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[tab]
    rows = list(ws.iter_rows(min_row=start_row + 1, values_only=True))
    wb.close()
    return rows


def _parse_structure(path: Path) -> list[dict[str, Any]]:
    """Extract 6-digit occupations (code, title, unit_group) from Table 5."""
    occs: list[dict[str, Any]] = []
    unit_group: str | None = None
    for row in _sheet_rows(path, "Table 5", _S_HEADER_ROW):
        if len(row) <= _S_OCC_TITLE:
            continue
        if _is_code(row[_S_UNIT_GROUP], 4):
            unit_group = _s(row[_S_UNIT_GROUP])
        if _is_code(row[_S_OCC_CODE], 6):
            occs.append(
                {
                    "osca_code": _s(row[_S_OCC_CODE]),
                    "title": _s(row[_S_OCC_TITLE]),
                    "unit_group": unit_group,
                }
            )
    return occs


def _parse_descriptions(path: Path) -> tuple[dict[str, str], list[dict[str, Any]]]:
    """Return (description-by-code, main-task rows) from Category Descriptions."""
    desc: dict[str, str] = {}
    tasks: list[dict[str, Any]] = []
    for row in _sheet_rows(path, "Table 1", _D_HEADER_ROW):
        if len(row) <= _D_MAIN_TASKS or not _is_code(row[_D_CODE], 6):
            continue
        code = _s(row[_D_CODE])
        lead = _s(row[_D_LEAD])
        if lead and code is not None:
            desc[code] = lead
        raw_tasks = _s(row[_D_MAIN_TASKS])
        if raw_tasks:
            for t in (p.strip() for p in raw_tasks.split(";")):
                if t:
                    tasks.append({"osca_code": code, "task_text": t})
    return desc, tasks


def _parse_correspondence(path: Path, tab: str) -> list[dict[str, Any]]:
    """Forward-fill OSCA code; emit (osca_code, target_code, correspondence_type)."""
    edges: list[dict[str, Any]] = []
    osca_code: str | None = None
    for row in _sheet_rows(path, tab, _C_HEADER_ROW):
        if len(row) <= _C_TARGET:
            continue
        if _is_code(row[_C_OSCA], 6):
            osca_code = _s(row[_C_OSCA])
        target = _s(row[_C_TARGET])
        if osca_code is None or target is None:
            continue
        flag = _s(row[_C_FLAG])
        edges.append(
            {
                "osca_code": osca_code,
                "target": target,
                "correspondence_type": "partial" if flag == "p" else "full",
            }
        )
    return edges


async def _bulk_insert(
    session: AsyncSession, table: str, rows: list[dict[str, Any]], version: str
) -> int:
    """Insert rows with an osca_version column, batched."""
    if not rows:
        return 0
    for r in rows:
        r["osca_version"] = version
    cols = list(rows[0].keys())
    sql = text(
        f"INSERT INTO {table} ({', '.join(cols)}) " f"VALUES ({', '.join(f':{c}' for c in cols)})"
    )
    for i in range(0, len(rows), 5000):
        await session.execute(sql, rows[i : i + 5000])
    return len(rows)


async def _clear_existing(session: AsyncSession) -> None:
    for table in ("osca_main_tasks", "osca_anzsco_map", "osca_isco_map", "osca_occupations"):
        await session.execute(text(f"DELETE FROM {table}"))
    # Clear prior osca lineage before the version row (FK: deltas -> versions).
    await session.execute(
        delete(DatasetVersionDelta).where(DatasetVersionDelta.dataset_name == "osca")
    )
    await session.execute(delete(DatasetVersion).where(DatasetVersion.dataset_name == "osca"))


async def _link_abs_employment(session: AsyncSession) -> int:
    """Populate abs_employment.osca_code for 6-digit ANZSCO codes with a UNIQUE
    OSCA mapping (dual-key, non-breaking, additive).

    4-digit ANZSCO unit-group rows and ambiguous (n:m) mappings are left NULL —
    they need employment apportionment, which belongs to the AU-profile compute
    step (docs/domain-model.md decision point). We never guess a single OSCA
    code for a one-to-many correspondence.
    """
    result = await session.execute(
        text(
            """
            UPDATE abs_employment ae
            SET osca_code = m.osca_code
            FROM (
                SELECT anzsco_code, MIN(osca_code) AS osca_code
                FROM osca_anzsco_map
                GROUP BY anzsco_code
                HAVING COUNT(DISTINCT osca_code) = 1
            ) m
            WHERE ae.anzsco_code = m.anzsco_code
              AND length(ae.anzsco_code) = 6
            """
        )
    )
    return result.rowcount or 0  # type: ignore[attr-defined]


async def ingest_osca(
    session: AsyncSession, data_path: str, version: str = "2024.1.0"
) -> dict[str, int]:
    """Ingest OSCA 2024 backbone + correspondences. Returns per-table row counts."""
    path = Path(data_path)
    files = {k: path / v for k, v in _FILES.items()}
    for label, fp in files.items():
        if not fp.exists():
            raise FileNotFoundError(f"OSCA {label} file missing: {fp}")

    integrity_hash = compute_files_hash(list(files.values()))
    logger.info("Parsing OSCA workbooks from %s", data_path)

    occs = _parse_structure(files["structure"])
    desc_by_code, main_tasks = _parse_descriptions(files["descriptions"])
    for occ in occs:
        occ["description"] = desc_by_code.get(occ["osca_code"])

    anzsco = [
        {
            "osca_code": e["osca_code"],
            "anzsco_code": e["target"],
            "correspondence_type": e["correspondence_type"],
        }
        for e in _parse_correspondence(files["correspondence"], "Table 2")
    ]
    isco = [
        {
            "osca_code": e["osca_code"],
            "isco08_code": e["target"],
            "correspondence_type": e["correspondence_type"],
        }
        for e in _parse_correspondence(files["correspondence"], "Table 8")
    ]

    total = len(occs) + len(main_tasks) + len(anzsco) + len(isco)

    await _clear_existing(session)
    version_id = (
        await session.execute(
            insert(DatasetVersion)
            .values(
                dataset_name="osca",
                version_key=version,
                row_count=total,
                integrity_hash=integrity_hash,
                source_url="https://www.abs.gov.au/statistics/classifications/osca-occupation-standard-classification-australia/2024-version-1-0",
                metadata_={
                    "files": list(_FILES.values()),
                    "counts": {
                        "occupations": len(occs),
                        "main_tasks": len(main_tasks),
                        "anzsco_map": len(anzsco),
                        "isco_map": len(isco),
                    },
                },
            )
            .returning(DatasetVersion.id)
        )
    ).scalar_one()
    await session.flush()
    logger.info("Registered OSCA %s as dataset_version id=%d", version, version_id)

    counts = {
        "osca_occupations": await _bulk_insert(session, "osca_occupations", occs, version),
        "osca_main_tasks": await _bulk_insert(session, "osca_main_tasks", main_tasks, version),
        "osca_anzsco_map": await _bulk_insert(session, "osca_anzsco_map", anzsco, version),
        "osca_isco_map": await _bulk_insert(session, "osca_isco_map", isco, version),
    }

    linked = await _link_abs_employment(session)
    counts["abs_employment_osca_linked"] = linked
    logger.info("Linked %d abs_employment rows to OSCA (unique 6-digit matches)", linked)

    await session.execute(
        insert(DatasetVersionDelta).values(
            dataset_name="osca",
            from_version_id=None,
            to_version_id=version_id,
            records_added=total,
            records_removed=0,
            records_changed=0,
            delta_detail={"type": "initial_load", "tables": counts},
        )
    )
    await session.commit()
    logger.info("OSCA %s ingestion complete: %s", version, counts)
    return counts
