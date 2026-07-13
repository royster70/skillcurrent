"""BLS OEWS employment data ingestion.

Parses the national sector-level OEWS Excel file and loads occupation x industry
employment data into oews_employment. Filters to detail-level occupations only.

Source: https://www.bls.gov/oes/tables.htm
Data: May 2024 Occupational Employment and Wage Statistics
"""

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion, DatasetVersionDelta
from app.utils.hashing import compute_file_hash

logger = logging.getLogger(__name__)

DATASET_NAME = "oews"
DATASET_VERSION = "2024"


def _clean_numeric(series: pd.Series, target_type: str = "int") -> pd.Series:
    """Convert BLS numeric columns, replacing suppressed values ('**', '*', '#') with None."""
    cleaned = pd.to_numeric(series, errors="coerce")
    if target_type == "int":
        return cleaned.astype("Int64")
    return cleaned


def _normalize_numpy_types(rows: list[dict[str, Any]]) -> None:
    """In-place: convert numpy/pandas scalar types to plain Python for the DB driver."""
    for row in rows:
        for key, value in row.items():
            try:
                if value is pd.NA or (isinstance(value, float) and np.isnan(value)):
                    row[key] = None
                elif isinstance(value, np.integer):
                    row[key] = int(value)
                elif isinstance(value, np.floating):
                    row[key] = float(value)
            except (TypeError, ValueError):
                pass


async def ingest_oews(
    session: AsyncSession,
    data_path: str,
    filename: str = "natsector_M2024_dl.xlsx",
    release_year: int = 2024,
    version: str = DATASET_VERSION,
) -> dict[str, int]:
    """Ingest OEWS national sector employment data.

    Args:
        session: Async database session.
        data_path: Path to directory containing the Excel file.
        filename: Name of the natsector Excel file.
        release_year: OEWS release year.
        version: Dataset version string.

    Returns:
        Dict with table name and row count.
    """
    path = Path(data_path)
    filepath = path / filename

    if not filepath.exists():
        raise FileNotFoundError(f"OEWS file not found: {filepath}")

    # Compute integrity hash before checking existing version
    integrity_hash = compute_file_hash(filepath)

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
                f"OEWS version {version} already ingested but source data has changed. "
                f"Stored hash: {existing_row.integrity_hash[:16]}... "
                f"New hash: {integrity_hash[:16]}... "
                "Delete the existing dataset_versions row to force re-ingest."
            )
        raise ValueError(f"OEWS version {version} already ingested (unchanged).")

    logger.info("Starting OEWS ingestion from %s", filepath)

    # Read Excel
    df = pd.read_excel(filepath, dtype=str)
    logger.info("Read %d total rows", len(df))

    # Filter to detail-level occupations only (skip totals, major, minor, broad)
    df = df[df["O_GROUP"] == "detailed"].copy()
    logger.info("Filtered to %d detail-level rows", len(df))

    # Map columns to our schema
    result_df = pd.DataFrame(
        {
            "onet_soc": df["OCC_CODE"],
            "naics_code": df["NAICS"],
            "naics_title": df["NAICS_TITLE"],
            "area_code": "US0000",
            "employment": _clean_numeric(df["TOT_EMP"], "int"),
            "employment_per_1000": _clean_numeric(df["JOBS_1000"], "float"),
            "mean_annual_wage": _clean_numeric(df["A_MEAN"], "int"),
            "median_annual_wage": _clean_numeric(df["A_MEDIAN"], "int"),
            "release_year": release_year,
        }
    )

    # Drop rows where both employment and wages are null (fully suppressed)
    before = len(result_df)
    result_df = result_df.dropna(subset=["employment", "mean_annual_wage"], how="all")
    logger.info(
        "Dropped %d fully suppressed rows, %d remaining", before - len(result_df), len(result_df)
    )

    # Register version (ADR-002)
    version_result = await session.execute(
        insert(DatasetVersion)
        .values(
            dataset_name=DATASET_NAME,
            version_key=version,
            row_count=len(result_df),
            integrity_hash=integrity_hash,
            source_url="https://www.bls.gov/oes/tables.htm",
            metadata_={
                "release": f"May {release_year} OEWS",
                "source_file": filename,
                "total_rows_in_file": len(df),
                "detail_rows_loaded": len(result_df),
                "unique_soc_codes": int(result_df["onet_soc"].nunique()),
                "unique_naics_codes": int(result_df["naics_code"].nunique()),
                "suppressed_employment_rows": int(result_df["employment"].isna().sum()),
            },
        )
        .returning(DatasetVersion.id)
    )
    version_id = version_result.scalar_one()
    await session.flush()
    logger.info("Registered OEWS as dataset_version id=%d", version_id)

    # Convert to rows with proper Python types
    rows = result_df.to_dict("records")
    _normalize_numpy_types(rows)

    # Bulk insert
    columns = list(rows[0].keys())
    col_list = ", ".join(columns)
    param_list = ", ".join(f":{c}" for c in columns)
    sql = text(f"INSERT INTO oews_employment ({col_list}) VALUES ({param_list})")

    batch_size = 5000
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        await session.execute(sql, batch)
        total += len(batch)

    logger.info("Loaded %d rows into oews_employment", total)

    counts = {"oews_employment": total}

    # Record version delta
    await session.execute(
        insert(DatasetVersionDelta).values(
            dataset_name=DATASET_NAME,
            from_version_id=None,
            to_version_id=version_id,
            records_added=total,
            records_removed=0,
            records_changed=0,
            delta_detail={"type": "initial_load", "tables": counts},
        )
    )

    await session.commit()
    logger.info("OEWS ingestion complete: %d rows", total)
    return counts
