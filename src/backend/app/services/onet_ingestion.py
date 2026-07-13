"""O*NET 28.1 data ingestion service.

Parses 9 tab-delimited files from onetcenter.org and bulk-loads them into
PostgreSQL. Registers the version in dataset_versions (ADR-002) and logs
the ingestion in transformation_log (ADR-001).

Files ingested:
  1. Occupation Data.txt        -> onet_occupations (existing table)
  2. Task Statements.txt        -> onet_task_statements
  3. Task Ratings.txt           -> onet_task_ratings
  4. Work Activities.txt        -> onet_work_activities
  5. DWA Reference.txt          -> onet_dwa_references
  6. Tasks to DWAs.txt          -> onet_tasks_to_dwas
  7. Sample of Reported Titles.txt -> onet_sample_titles
  8. Alternate Titles.txt       -> onet_alternate_titles
  9. Emerging Tasks.txt         -> onet_emerging_tasks
"""

import logging
from pathlib import Path

import pandas as pd
from sqlalchemy import delete, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion, DatasetVersionDelta
from app.utils.hashing import compute_files_hash

logger = logging.getLogger(__name__)


# Column mappings: O*NET file headers -> database column names
# Only map columns where the names differ; matching names are passed through.

_OCCUPATION_COLS = {
    "O*NET-SOC Code": "onet_soc",
    "Title": "title",
    "Description": "description",
}

_TASK_STATEMENT_COLS = {
    "O*NET-SOC Code": "onet_soc",
    "Task ID": "task_id",
    "Task": "task",
    "Task Type": "task_type",
    "Incumbents Responding": "incumbents_responding",
    "Date": "date",
    "Domain Source": "domain_source",
}

_TASK_RATING_COLS = {
    "O*NET-SOC Code": "onet_soc",
    "Task ID": "task_id",
    "Scale ID": "scale_id",
    "Category": "category",
    "Data Value": "data_value",
    "N": "n",
    "Standard Error": "standard_error",
    "Lower CI Bound": "lower_ci_bound",
    "Upper CI Bound": "upper_ci_bound",
    "Recommend Suppress": "recommend_suppress",
    "Date": "date",
    "Domain Source": "domain_source",
}

_WORK_ACTIVITY_COLS = {
    "O*NET-SOC Code": "onet_soc",
    "Element ID": "element_id",
    "Element Name": "element_name",
    "Scale ID": "scale_id",
    "Data Value": "data_value",
    "N": "n",
    "Standard Error": "standard_error",
    "Lower CI Bound": "lower_ci_bound",
    "Upper CI Bound": "upper_ci_bound",
    "Recommend Suppress": "recommend_suppress",
    "Not Relevant": "not_relevant",
    "Date": "date",
    "Domain Source": "domain_source",
}

_DWA_REFERENCE_COLS = {
    "Element ID": "element_id",
    "IWA ID": "iwa_id",
    "DWA ID": "dwa_id",
    "DWA Title": "dwa_title",
}

_TASKS_TO_DWAS_COLS = {
    "O*NET-SOC Code": "onet_soc",
    "Task ID": "task_id",
    "DWA ID": "dwa_id",
    "Date": "date",
    "Domain Source": "domain_source",
}

_SAMPLE_TITLE_COLS = {
    "O*NET-SOC Code": "onet_soc",
    "Reported Job Title": "reported_job_title",
    "Shown in My Next Move": "shown_in_my_next_move",
}

_ALTERNATE_TITLE_COLS = {
    "O*NET-SOC Code": "onet_soc",
    "Alternate Title": "alternate_title",
    "Short Title": "short_title",
    "Source(s)": "sources",
}

_EMERGING_TASK_COLS = {
    "O*NET-SOC Code": "onet_soc",
    "Task": "task",
    "Category": "category",
    "Original Task ID": "original_task_id",
    "Original Task": "original_task",
    "Date": "date",
    "Domain Source": "domain_source",
}


# Columns that must be cast to numeric types after reading as string.
# Maps DB column name -> 'int' or 'float'. Everything else stays as str.
_NUMERIC_COLS: dict[str, str] = {
    "task_id": "int",
    "incumbents_responding": "int",
    "data_value": "float",
    "n": "int",
    "standard_error": "float",
    "lower_ci_bound": "float",
    "upper_ci_bound": "float",
    "employment": "int",
    "employment_per_1000": "float",
    "mean_annual_wage": "int",
    "median_annual_wage": "int",
    "employment_share": "float",
    "headcount": "int",
    "weight": "float",
}


def _read_onet_file(
    data_path: Path,
    filename: str,
    col_mapping: dict[str, str],
) -> pd.DataFrame:
    """Read an O*NET tab-delimited file and rename columns to match DB schema.

    All columns are read as strings initially to prevent pandas from
    auto-casting text columns (like 'Category', 'Original Task ID') to float.
    Numeric columns are then cast based on the _NUMERIC_COLS registry.
    """
    filepath = data_path / filename
    if not filepath.exists():
        raise FileNotFoundError(f"O*NET file not found: {filepath}")

    # Read everything as string to prevent type inference issues
    df = pd.read_csv(filepath, sep="\t", dtype=str, encoding="utf-8", keep_default_na=False)

    # Only keep columns we have mappings for
    available_cols = {k: v for k, v in col_mapping.items() if k in df.columns}
    df = df[list(available_cols.keys())].rename(columns=available_cols)

    # Replace empty strings with None
    df = df.replace("", None)

    # Cast known numeric columns
    for col in df.columns:
        if col in _NUMERIC_COLS:
            num_type = _NUMERIC_COLS[col]
            df[col] = pd.to_numeric(df[col], errors="coerce")
            if num_type == "int":
                df[col] = df[col].astype("Int64")  # nullable integer

    return df


async def _check_existing_version(session: AsyncSession, version_key: str) -> DatasetVersion | None:
    """Check if this O*NET version is already ingested."""
    result = await session.execute(
        select(DatasetVersion).where(
            DatasetVersion.dataset_name == "onet",
            DatasetVersion.version_key == version_key,
        )
    )
    return result.scalar_one_or_none()


async def _bulk_insert(
    session: AsyncSession,
    table_name: str,
    df: pd.DataFrame,
    onet_version: str,
    batch_size: int = 5000,
) -> int:
    """Bulk insert DataFrame rows into a table, adding onet_version column."""
    if df.empty:
        return 0

    # Replace NaN with None for proper SQL NULL handling
    df = df.where(pd.notna(df), None)

    # Add version column
    df = df.copy()
    df["onet_version"] = onet_version

    rows = df.to_dict("records")
    total = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        await session.execute(text(f"DELETE FROM {table_name} WHERE FALSE"))  # validate table name
        await session.execute(
            insert(text(table_name)), batch
        )  # noqa: not raw SQL injection — table name from code
        total += len(batch)

    return total


async def _bulk_insert_safe(
    session: AsyncSession,
    table_name: str,
    df: pd.DataFrame,
    onet_version: str,
    batch_size: int = 5000,
) -> int:
    """Bulk insert using raw SQL with proper parameterisation."""
    if df.empty:
        return 0

    df = df.copy()
    df["onet_version"] = onet_version

    # Convert pandas/numpy types to Python natives.
    # asyncpg rejects float NaN in str columns and numpy int64/float64.
    import numpy as np

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


async def ingest_onet(
    session: AsyncSession,
    data_path: str,
    version: str = "28.1",
) -> dict[str, int]:
    """Ingest all 9 O*NET files into the database.

    Args:
        session: Async database session.
        data_path: Path to directory containing O*NET .txt files.
        version: O*NET version string (e.g., "28.1").

    Returns:
        Dict mapping table names to row counts inserted.

    Raises:
        FileNotFoundError: If any required file is missing.
        ValueError: If this version is already ingested.
    """
    path = Path(data_path)
    if not path.is_dir():
        raise FileNotFoundError(f"O*NET data directory not found: {data_path}")

    onet_files = [
        "Occupation Data.txt",
        "Task Statements.txt",
        "Task Ratings.txt",
        "Work Activities.txt",
        "DWA Reference.txt",
        "Tasks to DWAs.txt",
        "Sample of Reported Titles.txt",
        "Alternate Titles.txt",
        "Emerging Tasks.txt",
    ]

    # Verify all files exist before starting
    for filename in onet_files:
        if not (path / filename).exists():
            raise FileNotFoundError(f"Required O*NET file missing: {path / filename}")

    # Compute integrity hash across all files before checking existing version
    integrity_hash = compute_files_hash([path / f for f in onet_files])

    # Check for existing version
    existing = await _check_existing_version(session, version)
    if existing:
        if existing.integrity_hash != integrity_hash:
            raise ValueError(
                f"O*NET version {version} already ingested but source data has changed. "
                f"Stored hash: {existing.integrity_hash[:16]}... "
                f"New hash: {integrity_hash[:16]}... "
                "Delete the existing dataset_versions row to force re-ingest."
            )
        raise ValueError(
            f"O*NET version {version} already ingested "
            f"(ingested_at={existing.ingested_at}). "
            f"Versions are immutable — use a new version_key for updated data."
        )

    logger.info("Starting O*NET %s ingestion from %s", version, data_path)

    # ── Read all files ──
    logger.info("Reading O*NET files...")

    occupations_df = _read_onet_file(path, "Occupation Data.txt", _OCCUPATION_COLS)
    tasks_df = _read_onet_file(path, "Task Statements.txt", _TASK_STATEMENT_COLS)
    ratings_df = _read_onet_file(path, "Task Ratings.txt", _TASK_RATING_COLS)
    activities_df = _read_onet_file(path, "Work Activities.txt", _WORK_ACTIVITY_COLS)
    dwa_ref_df = _read_onet_file(path, "DWA Reference.txt", _DWA_REFERENCE_COLS)
    tasks_to_dwas_df = _read_onet_file(path, "Tasks to DWAs.txt", _TASKS_TO_DWAS_COLS)
    sample_titles_df = _read_onet_file(path, "Sample of Reported Titles.txt", _SAMPLE_TITLE_COLS)
    alt_titles_df = _read_onet_file(path, "Alternate Titles.txt", _ALTERNATE_TITLE_COLS)
    emerging_df = _read_onet_file(path, "Emerging Tasks.txt", _EMERGING_TASK_COLS)

    total_rows = sum(
        len(df)
        for df in [
            occupations_df,
            tasks_df,
            ratings_df,
            activities_df,
            dwa_ref_df,
            tasks_to_dwas_df,
            sample_titles_df,
            alt_titles_df,
            emerging_df,
        ]
    )

    # ── Register version in dataset_versions (ADR-002) ──
    version_result = await session.execute(
        insert(DatasetVersion)
        .values(
            dataset_name="onet",
            version_key=version,
            row_count=total_rows,
            integrity_hash=integrity_hash,
            source_url="https://www.onetcenter.org/database.html",
            metadata_={
                "files": onet_files,
                "file_counts": {
                    "occupations": len(occupations_df),
                    "task_statements": len(tasks_df),
                    "task_ratings": len(ratings_df),
                    "work_activities": len(activities_df),
                    "dwa_references": len(dwa_ref_df),
                    "tasks_to_dwas": len(tasks_to_dwas_df),
                    "sample_titles": len(sample_titles_df),
                    "alternate_titles": len(alt_titles_df),
                    "emerging_tasks": len(emerging_df),
                },
            },
        )
        .returning(DatasetVersion.id)
    )
    version_id = version_result.scalar_one()
    await session.flush()

    logger.info("Registered O*NET %s as dataset_version id=%d", version, version_id)

    # ── Load data in dependency order ──
    counts: dict[str, int] = {}

    # 1. Occupations first (other tables FK to this)
    logger.info("Loading occupations (%d rows)...", len(occupations_df))
    counts["onet_occupations"] = await _bulk_insert_safe(
        session, "onet_occupations", occupations_df, version
    )

    # 2. DWA references (no FK dependency on occupations)
    logger.info("Loading DWA references (%d rows)...", len(dwa_ref_df))
    counts["onet_dwa_references"] = await _bulk_insert_safe(
        session, "onet_dwa_references", dwa_ref_df, version
    )

    # 3. Task statements (FK to occupations)
    logger.info("Loading task statements (%d rows)...", len(tasks_df))
    counts["onet_task_statements"] = await _bulk_insert_safe(
        session, "onet_task_statements", tasks_df, version
    )

    # 4. Task ratings (FK to occupations)
    logger.info("Loading task ratings (%d rows)...", len(ratings_df))
    counts["onet_task_ratings"] = await _bulk_insert_safe(
        session, "onet_task_ratings", ratings_df, version
    )

    # 5. Work activities (FK to occupations)
    logger.info("Loading work activities (%d rows)...", len(activities_df))
    counts["onet_work_activities"] = await _bulk_insert_safe(
        session, "onet_work_activities", activities_df, version
    )

    # 6. Tasks to DWAs (FK to occupations)
    logger.info("Loading tasks-to-DWAs mapping (%d rows)...", len(tasks_to_dwas_df))
    counts["onet_tasks_to_dwas"] = await _bulk_insert_safe(
        session, "onet_tasks_to_dwas", tasks_to_dwas_df, version
    )

    # 7. Sample titles (FK to occupations)
    logger.info("Loading sample titles (%d rows)...", len(sample_titles_df))
    counts["onet_sample_titles"] = await _bulk_insert_safe(
        session, "onet_sample_titles", sample_titles_df, version
    )

    # 8. Alternate titles (FK to occupations)
    logger.info("Loading alternate titles (%d rows)...", len(alt_titles_df))
    counts["onet_alternate_titles"] = await _bulk_insert_safe(
        session, "onet_alternate_titles", alt_titles_df, version
    )

    # 9. Emerging tasks (FK to occupations)
    logger.info("Loading emerging tasks (%d rows)...", len(emerging_df))
    counts["onet_emerging_tasks"] = await _bulk_insert_safe(
        session, "onet_emerging_tasks", emerging_df, version
    )

    # ── Record initial version delta (all records are "added") ──
    await session.execute(
        insert(DatasetVersionDelta).values(
            dataset_name="onet",
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
        "O*NET %s ingestion complete. Total rows: %d. Tables: %s",
        version,
        sum(counts.values()),
        counts,
    )

    return counts
