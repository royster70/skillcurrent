"""Eloundou et al. (2024) occupation-level exposure score ingestion.

Parses occ_level.csv and loads into eloundou_occ_scores with column mapping:
  alpha → E1 (direct LLM exposure)
  beta  → E2 (complementary/tools exposure)
  gamma → E0 (overall exposure)

Computes derived Beta = E1 + 0.5*E2 for both GPT-4 and human raters on ingest.

Source: OpenAI supplementary data
Paper: Eloundou, Manning, Mishkin, Rock (2024). Science 384:1306-1308.
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion, DatasetVersionDelta
from app.utils.hashing import compute_file_hash

logger = logging.getLogger(__name__)

DATASET_NAME = "eloundou"
DATASET_VERSION = "2024_science"


async def ingest_eloundou(
    session: AsyncSession,
    data_path: str,
    version: str = DATASET_VERSION,
) -> dict[str, int]:
    """Ingest Eloundou occupation-level exposure scores.

    Args:
        session: Async database session.
        data_path: Path to directory containing occ_level.csv.
        version: Dataset version string.

    Returns:
        Dict with table name and row count.
    """
    path = Path(data_path)
    csv_path = path / "occ_level.csv"

    if not csv_path.exists():
        raise FileNotFoundError(f"Eloundou data file not found: {csv_path}")

    # Compute integrity hash before checking existing version
    integrity_hash = compute_file_hash(csv_path)

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
                f"Eloundou version {version} already ingested but source data has changed. "
                f"Stored hash: {existing_row.integrity_hash[:16]}... "
                f"New hash: {integrity_hash[:16]}... "
                "Delete the existing dataset_versions row to force re-ingest."
            )
        raise ValueError(f"Eloundou version {version} already ingested (unchanged).")

    logger.info("Starting Eloundou ingestion from %s", csv_path)

    # Read CSV
    df = pd.read_csv(csv_path)
    logger.info("Read %d occupation scores", len(df))

    # Rename columns to match our schema
    df = df.rename(columns={
        "O*NET-SOC Code": "onet_soc",
        "Title": "title",
        "dv_rating_alpha": "dv_e1_alpha",
        "dv_rating_beta": "dv_e2_beta",
        "dv_rating_gamma": "dv_e0_gamma",
        "human_rating_alpha": "human_e1_alpha",
        "human_rating_beta": "human_e2_beta",
        "human_rating_gamma": "human_e0_gamma",
    })

    # Compute derived Beta = E1 + 0.5*E2 for both rater types
    df["dv_beta_derived"] = df["dv_e1_alpha"] + 0.5 * df["dv_e2_beta"]
    df["human_beta_derived"] = df["human_e1_alpha"] + 0.5 * df["human_e2_beta"]

    # Add versioning
    df["dataset_version"] = version
    df["onet_version"] = "28.1"

    # Validate E0 >= max(E1, E2) invariant
    dv_violations = df[df["dv_e0_gamma"] < df[["dv_e1_alpha", "dv_e2_beta"]].max(axis=1)]
    human_violations = df[df["human_e0_gamma"] < df[["human_e1_alpha", "human_e2_beta"]].max(axis=1)]
    if len(dv_violations) > 0:
        logger.warning("E0 >= max(E1,E2) violated in %d GPT-4 rows", len(dv_violations))
    if len(human_violations) > 0:
        logger.warning("E0 >= max(E1,E2) violated in %d human rows", len(human_violations))

    # Register version (ADR-002)
    version_result = await session.execute(
        insert(DatasetVersion)
        .values(
            dataset_name=DATASET_NAME,
            version_key=version,
            row_count=len(df),
            integrity_hash=integrity_hash,
            source_url="https://arxiv.org/abs/2303.10130",
            metadata_={
                "paper": "Eloundou, Manning, Mishkin, Rock (2024). Science 384:1306-1308",
                "source_file": "occ_level.csv",
                "occupations": len(df),
                "raters": ["gpt4 (dv_)", "human"],
                "dv_beta_mean": float(df["dv_beta_derived"].mean()),
                "human_beta_mean": float(df["human_beta_derived"].mean()),
                "dv_invariant_violations": len(dv_violations),
                "human_invariant_violations": len(human_violations),
            },
        )
        .returning(DatasetVersion.id)
    )
    version_id = version_result.scalar_one()
    await session.flush()
    logger.info("Registered Eloundou as dataset_version id=%d", version_id)

    # Convert to rows with proper Python types
    rows = df.to_dict("records")
    for row in rows:
        for key, value in row.items():
            try:
                if value is pd.NA or (isinstance(value, float) and np.isnan(value)):
                    row[key] = None
                elif isinstance(value, (np.floating,)):
                    row[key] = float(value)
                elif isinstance(value, (np.integer,)):
                    row[key] = int(value)
            except (TypeError, ValueError):
                pass

    # Bulk insert
    columns = list(rows[0].keys())
    col_list = ", ".join(columns)
    param_list = ", ".join(f":{c}" for c in columns)
    sql = text(f"INSERT INTO eloundou_occ_scores ({col_list}) VALUES ({param_list})")

    logger.info("Loading %d occupation scores...", len(rows))
    await session.execute(sql, rows)

    counts = {"eloundou_occ_scores": len(rows)}

    # Record initial version delta
    await session.execute(
        insert(DatasetVersionDelta).values(
            dataset_name=DATASET_NAME,
            from_version_id=None,
            to_version_id=version_id,
            records_added=len(rows),
            records_removed=0,
            records_changed=0,
            delta_detail={"type": "initial_load", "tables": counts},
        )
    )

    await session.commit()

    logger.info("Eloundou ingestion complete: %d occupation scores loaded", len(rows))
    return counts
