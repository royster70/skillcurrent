"""AEI labor market impact data ingestion.

Parses job_exposure.csv and task_penetration.csv from the Anthropic
Economic Index labor_market_impacts directory.

Source: https://huggingface.co/datasets/Anthropic/EconomicIndex (CC-BY)
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

DATASET_NAME = "aei"
DATASET_VERSION = "labor_market_2026"


def _df_to_rows(df: pd.DataFrame) -> list[dict]:
    rows = df.to_dict("records")
    for row in rows:
        for key, value in row.items():
            try:
                if value is pd.NA or (isinstance(value, float) and np.isnan(value)):
                    row[key] = None
                elif isinstance(value, (np.integer,)):
                    row[key] = int(value)
                elif isinstance(value, (np.floating,)):
                    row[key] = float(value)
            except (TypeError, ValueError):
                pass
    return rows


async def ingest_aei_labor_market(
    session: AsyncSession,
    data_path: str,
    version: str = DATASET_VERSION,
) -> dict[str, int]:
    """Ingest AEI labor market impact files.

    Args:
        session: Async database session.
        data_path: Path to directory containing job_exposure.csv and task_penetration.csv.
        version: Dataset version string.

    Returns:
        Dict mapping table names to row counts inserted.
    """
    path = Path(data_path)
    files = ["job_exposure.csv", "task_penetration.csv"]

    for f in files:
        if not (path / f).exists():
            raise FileNotFoundError(f"AEI file not found: {path / f}")

    # Compute integrity hash before checking existing version
    integrity_hash = compute_files_hash([path / f for f in files])

    # Check existing version
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
                f"AEI version {version} already ingested but source data has changed. "
                f"Stored hash: {existing_row.integrity_hash[:16]}... "
                f"New hash: {integrity_hash[:16]}... "
                "Delete the existing dataset_versions row to force re-ingest."
            )
        raise ValueError(f"AEI version {version} already ingested (unchanged).")

    logger.info("Starting AEI labor market ingestion from %s", data_path)

    # Read files
    job_df = pd.read_csv(path / "job_exposure.csv")
    job_df = job_df.rename(columns={"occ_code": "occ_code"})
    job_df["dataset_version"] = version

    task_df = pd.read_csv(path / "task_penetration.csv")
    task_df["dataset_version"] = version

    total_rows = len(job_df) + len(task_df)

    # Register version (ADR-002)
    version_result = await session.execute(
        insert(DatasetVersion)
        .values(
            dataset_name=DATASET_NAME,
            version_key=version,
            row_count=total_rows,
            integrity_hash=integrity_hash,
            source_url="https://huggingface.co/datasets/Anthropic/EconomicIndex",
            metadata_={
                "paper": "Anthropic Economic Index (2025-2026)",
                "license": "CC-BY",
                "source_files": files,
                "file_counts": {
                    "job_exposure": len(job_df),
                    "task_penetration": len(task_df),
                },
                "job_exposure_mean": float(job_df["observed_exposure"].mean()),
                "task_penetration_nonzero_pct": float(
                    (task_df["penetration"] > 0).sum() / len(task_df) * 100
                ),
            },
        )
        .returning(DatasetVersion.id)
    )
    version_id = version_result.scalar_one()
    await session.flush()
    logger.info("Registered AEI as dataset_version id=%d", version_id)

    counts: dict[str, int] = {}

    # Load job exposure
    logger.info("Loading job exposure (%d rows)...", len(job_df))
    job_rows = _df_to_rows(job_df)
    columns = list(job_rows[0].keys())
    sql = text(
        f"INSERT INTO aei_job_exposure ({', '.join(columns)}) "
        f"VALUES ({', '.join(f':{c}' for c in columns)})"
    )
    await session.execute(sql, job_rows)
    counts["aei_job_exposure"] = len(job_rows)

    # Load task penetration (batch for large file)
    logger.info("Loading task penetration (%d rows)...", len(task_df))
    task_rows = _df_to_rows(task_df)
    columns = list(task_rows[0].keys())
    sql = text(
        f"INSERT INTO aei_task_penetration ({', '.join(columns)}) "
        f"VALUES ({', '.join(f':{c}' for c in columns)})"
    )
    batch_size = 5000
    for i in range(0, len(task_rows), batch_size):
        await session.execute(sql, task_rows[i : i + batch_size])
    counts["aei_task_penetration"] = len(task_rows)

    # Record version delta
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
    logger.info("AEI ingestion complete: %s", counts)
    return counts
