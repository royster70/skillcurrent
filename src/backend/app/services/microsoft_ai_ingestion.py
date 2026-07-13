"""Microsoft "Working with AI" dataset ingestion service.

Parses 5 CSV files from the Microsoft research repository and bulk-loads
them into PostgreSQL. Registers the version in dataset_versions (ADR-002).

Source: https://github.com/microsoft/working-with-ai (CC-BY 4.0)
Paper: Tomlinson et al. (2025) "Working with AI"

Files ingested:
  1. ai_applicability_scores.csv -> ms_ai_applicability_scores
  2. soc_metrics.csv             -> ms_ai_soc_metrics
  3. iwa_metrics.csv             -> ms_ai_iwa_metrics
  4. soc_to_iwas.csv             -> ms_ai_soc_to_iwas
  5. physical_tasks.csv          -> ms_ai_physical_tasks
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion, DatasetVersionDelta
from app.utils.hashing import compute_files_hash

logger = logging.getLogger(__name__)

DATASET_NAME = "microsoft_working_with_ai"
DATASET_VERSION = "2025-07"  # arXiv:2507.07935, data period Jan-Sept 2024


def _read_csv_safe(data_path: Path, filename: str) -> pd.DataFrame:
    """Read CSV with all values as strings, then convert types explicitly."""
    filepath = data_path / filename
    if not filepath.exists():
        raise FileNotFoundError(f"Microsoft AI file not found: {filepath}")
    return pd.read_csv(filepath)


def _df_to_rows(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to list of dicts with proper Python types (no numpy)."""
    rows = df.to_dict("records")
    for row in rows:
        for key, value in row.items():
            try:
                if value is pd.NA or (isinstance(value, float) and np.isnan(value)):
                    row[key] = None
                elif isinstance(value, np.integer):
                    row[key] = int(value)
                elif isinstance(value, np.floating):
                    row[key] = float(value)
                elif isinstance(value, np.bool_):
                    row[key] = bool(value)
            except (TypeError, ValueError):
                pass
    return rows


async def _bulk_insert(
    session: AsyncSession,
    table_name: str,
    rows: list[dict],
    batch_size: int = 5000,
) -> int:
    """Bulk insert rows into a table."""
    if not rows:
        return 0

    columns = list(rows[0].keys())
    col_list = ", ".join(columns)
    param_list = ", ".join(f":{c}" for c in columns)
    sql = text(f"INSERT INTO {table_name} ({col_list}) VALUES ({param_list})")

    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        await session.execute(sql, batch)
        total += len(batch)

    return total


async def ingest_microsoft_ai(
    session: AsyncSession,
    data_path: str,
    version: str = DATASET_VERSION,
) -> dict[str, int]:
    """Ingest all Microsoft 'Working with AI' CSV files.

    Args:
        session: Async database session.
        data_path: Path to directory containing the CSV files.
        version: Dataset version string.

    Returns:
        Dict mapping table names to row counts inserted.
    """
    path = Path(data_path)
    if not path.is_dir():
        raise FileNotFoundError(f"Microsoft AI data directory not found: {data_path}")

    files = [
        "ai_applicability_scores.csv",
        "soc_metrics.csv",
        "iwa_metrics.csv",
        "soc_to_iwas.csv",
        "physical_tasks.csv",
    ]

    # Verify all files exist
    for f in files:
        if not (path / f).exists():
            raise FileNotFoundError(f"Required file missing: {path / f}")

    # Compute integrity hash before checking existing version
    integrity_hash = compute_files_hash([path / f for f in files])

    # Check for existing version
    existing = await session.execute(
        select(DatasetVersion).where(
            DatasetVersion.dataset_name == DATASET_NAME,
            DatasetVersion.version_key == version,
        )
    )
    existing_row = existing.scalar_one_or_none()
    if existing_row:
        if existing_row.integrity_hash != integrity_hash:
            raise ValueError(
                f"Microsoft Working with AI version {version} already ingested but source data has changed. "
                f"Stored hash: {existing_row.integrity_hash[:16]}... "
                f"New hash: {integrity_hash[:16]}... "
                "Delete the existing dataset_versions row to force re-ingest."
            )
        raise ValueError(
            f"Microsoft Working with AI version {version} already ingested (unchanged)."
        )

    logger.info("Starting Microsoft AI dataset ingestion from %s", data_path)

    # ── Read all files ──
    scores_df = _read_csv_safe(path, "ai_applicability_scores.csv")
    scores_df = scores_df.rename(columns={"SOC Code": "soc_code"})
    scores_df["dataset_version"] = version

    soc_metrics_df = _read_csv_safe(path, "soc_metrics.csv")
    soc_metrics_df = soc_metrics_df.rename(columns={"SOC Code": "soc_code"})
    soc_metrics_df["dataset_version"] = version

    iwa_metrics_df = _read_csv_safe(path, "iwa_metrics.csv")
    iwa_metrics_df = iwa_metrics_df.rename(columns={"IWA": "iwa_code"})
    iwa_metrics_df["dataset_version"] = version

    soc_to_iwas_df = _read_csv_safe(path, "soc_to_iwas.csv")
    soc_to_iwas_df = soc_to_iwas_df.rename(columns={"SOC Code": "soc_code", "IWA": "iwa_code"})
    soc_to_iwas_df["dataset_version"] = version

    physical_df = _read_csv_safe(path, "physical_tasks.csv")
    physical_df = physical_df.rename(columns={"Task ID": "task_id", "Physical": "physical"})
    physical_df["dataset_version"] = version

    total_rows = sum(
        len(df) for df in [scores_df, soc_metrics_df, iwa_metrics_df, soc_to_iwas_df, physical_df]
    )

    # ── Register version (ADR-002) ──
    version_result = await session.execute(
        insert(DatasetVersion)
        .values(
            dataset_name=DATASET_NAME,
            version_key=version,
            row_count=total_rows,
            integrity_hash=integrity_hash,
            source_url="https://github.com/microsoft/working-with-ai",
            metadata_={
                "paper": "Tomlinson et al. (2025) arXiv:2507.07935",
                "license": "CC-BY-4.0",
                "data_period": "Jan-Sept 2024",
                "onet_version": "29.0",
                "soc_version": "SOC 2018",
                "file_counts": {
                    "applicability_scores": len(scores_df),
                    "soc_metrics": len(soc_metrics_df),
                    "iwa_metrics": len(iwa_metrics_df),
                    "soc_to_iwas": len(soc_to_iwas_df),
                    "physical_tasks": len(physical_df),
                },
            },
        )
        .returning(DatasetVersion.id)
    )
    version_id = version_result.scalar_one()
    await session.flush()
    logger.info("Registered Microsoft AI dataset as dataset_version id=%d", version_id)

    # ── Load data ──
    counts: dict[str, int] = {}

    logger.info("Loading applicability scores (%d rows)...", len(scores_df))
    counts["ms_ai_applicability_scores"] = await _bulk_insert(
        session, "ms_ai_applicability_scores", _df_to_rows(scores_df)
    )

    logger.info("Loading SOC metrics (%d rows)...", len(soc_metrics_df))
    counts["ms_ai_soc_metrics"] = await _bulk_insert(
        session, "ms_ai_soc_metrics", _df_to_rows(soc_metrics_df)
    )

    logger.info("Loading IWA metrics (%d rows)...", len(iwa_metrics_df))
    counts["ms_ai_iwa_metrics"] = await _bulk_insert(
        session, "ms_ai_iwa_metrics", _df_to_rows(iwa_metrics_df)
    )

    logger.info("Loading SOC-to-IWA mappings (%d rows)...", len(soc_to_iwas_df))
    counts["ms_ai_soc_to_iwas"] = await _bulk_insert(
        session, "ms_ai_soc_to_iwas", _df_to_rows(soc_to_iwas_df)
    )

    logger.info("Loading physical task flags (%d rows)...", len(physical_df))
    counts["ms_ai_physical_tasks"] = await _bulk_insert(
        session, "ms_ai_physical_tasks", _df_to_rows(physical_df)
    )

    # ── Record initial version delta ──
    await session.execute(
        insert(DatasetVersionDelta).values(
            dataset_name=DATASET_NAME,
            from_version_id=None,
            to_version_id=version_id,
            records_added=total_rows,
            records_removed=0,
            records_changed=0,
            delta_detail={"type": "initial_load", "tables": counts},
        )
    )

    await session.commit()

    logger.info(
        "Microsoft AI ingestion complete. Total: %d rows. Tables: %s",
        sum(counts.values()),
        counts,
    )
    return counts
