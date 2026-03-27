"""AEI temporal snapshot ingestion — multi-release pipeline.

Normalises all 4 AEI releases into the existing aei_task_snapshots table.
Each release represents a different model era, enabling drift velocity
calculation (FR-8.2) across Sonnet 3.5 → 3.7 → 4 → 4.5.

Release formats:
  - 2025-02-10 (v1): Simple CSV (task_name, pct)
  - 2025-03-27 (v2): Simple CSV + per-task automation/augmentation breakdown
  - 2025-09-15 (v3): Long-format, filter onet_task facet, global geography
  - 2026-01-15 (v4): Long-format, expanded facets, same extraction pattern

Source: https://huggingface.co/datasets/Anthropic/EconomicIndex (CC-BY)
"""

import logging
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion, DatasetVersionDelta
from app.utils.hashing import compute_files_hash

logger = logging.getLogger(__name__)

DATASET_NAME = "aei_temporal"


@dataclass
class ReleaseConfig:
    """Configuration for each AEI release."""
    version_key: str
    model_era: str
    snapshot_date: date
    platform: str


RELEASES = [
    ReleaseConfig(
        version_key="2025-02-10",
        model_era="sonnet-3.5",
        snapshot_date=date(2025, 2, 10),
        platform="claude_ai",
    ),
    ReleaseConfig(
        version_key="2025-03-27",
        model_era="sonnet-3.7",
        snapshot_date=date(2025, 3, 27),
        platform="claude_ai",
    ),
    ReleaseConfig(
        version_key="2025-09-15",
        model_era="sonnet-4",
        snapshot_date=date(2025, 9, 15),
        platform="claude_ai",
    ),
    ReleaseConfig(
        version_key="2026-01-15",
        model_era="sonnet-4.5",
        snapshot_date=date(2026, 1, 15),
        platform="claude_ai",
    ),
]

# Separate configs for 1P API data (releases 3-4 only)
API_RELEASES = [
    ReleaseConfig(
        version_key="2025-09-15",
        model_era="sonnet-4",
        snapshot_date=date(2025, 9, 15),
        platform="1p_api",
    ),
    ReleaseConfig(
        version_key="2026-01-15",
        model_era="sonnet-4.5",
        snapshot_date=date(2026, 1, 15),
        platform="1p_api",
    ),
]


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
                elif isinstance(value, (np.bool_,)):
                    row[key] = bool(value)
            except (TypeError, ValueError):
                pass
    return rows


def _load_release_v1(base_path: Path) -> pd.DataFrame:
    """Release 2025-02-10: Simple task → pct format."""
    df = pd.read_csv(base_path / "release_2025_02_10" / "onet_task_mappings.csv")
    return pd.DataFrame({
        "task_text": df["task_name"],
        "automation_pct": None,
        "augmentation_pct": None,
        "task_pct": df["pct"],
    })


def _load_release_v2(base_path: Path) -> pd.DataFrame:
    """Release 2025-03-27: Task pct + automation/augmentation breakdown."""
    pct_df = pd.read_csv(base_path / "release_2025_03_27" / "task_pct_v2.csv")
    auto_df = pd.read_csv(
        base_path / "release_2025_03_27" / "automation_vs_augmentation_by_task.csv"
    )

    # Merge pct with automation breakdown
    merged = pct_df.merge(auto_df, on="task_name", how="left")

    # Compute automation_pct and augmentation_pct per domain model
    merged["automation_pct"] = merged["directive"].fillna(0) + merged["feedback_loop"].fillna(0)
    merged["augmentation_pct"] = (
        merged["task_iteration"].fillna(0)
        + merged["learning"].fillna(0)
        + merged["validation"].fillna(0)
    )

    return pd.DataFrame({
        "task_text": merged["task_name"],
        "automation_pct": merged["automation_pct"],
        "augmentation_pct": merged["augmentation_pct"],
        "task_pct": merged["pct"],
    })


def _load_release_long_format(
    base_path: Path,
    release_dir: str,
    filename: str,
) -> pd.DataFrame:
    """Releases 3-4: Long-format, extract onet_task facet, global geography."""
    filepath = base_path / release_dir / "data" / "intermediate" / filename
    df = pd.read_csv(filepath)

    # Filter to onet_task facet, global geography, task_pct variable
    onet_tasks = df[
        (df["facet"] == "onet_task")
        & (df["geography"] == "global")
        & (df["variable"] == "onet_task_pct")
    ].copy()

    return pd.DataFrame({
        "task_text": onet_tasks["cluster_name"].values,
        "automation_pct": None,
        "augmentation_pct": None,
        "task_pct": onet_tasks["value"].values,
    })


async def _insert_snapshot(
    session: AsyncSession,
    df: pd.DataFrame,
    config: ReleaseConfig,
) -> int:
    """Insert a normalised snapshot into aei_task_snapshots."""
    df = df.copy()
    df["snapshot_date"] = config.snapshot_date
    df["release_version"] = config.version_key
    df["model_era"] = config.model_era
    df["platform"] = config.platform

    rows = _df_to_rows(df)
    if not rows:
        return 0

    columns = list(rows[0].keys())
    col_list = ", ".join(columns)
    param_list = ", ".join(f":{c}" for c in columns)
    sql = text(f"INSERT INTO aei_task_snapshots ({col_list}) VALUES ({param_list})")

    batch_size = 5000
    total = 0
    for i in range(0, len(rows), batch_size):
        await session.execute(sql, rows[i : i + batch_size])
        total += len(rows[i : i + batch_size])

    return total


async def ingest_aei_temporal(
    session: AsyncSession,
    data_path: str,
) -> dict[str, int]:
    """Ingest all 4 AEI temporal releases into aei_task_snapshots.

    Args:
        session: Async database session.
        data_path: Path to AEI-full directory containing release_* subdirs.

    Returns:
        Dict mapping release version to row count.
    """
    base_path = Path(data_path)

    if not base_path.is_dir():
        raise FileNotFoundError(f"AEI data directory not found: {data_path}")

    # Compute integrity hash from all source files before checking existing version
    source_files_for_check: list[Path] = [
        base_path / "release_2025_02_10" / "onet_task_mappings.csv",
        base_path / "release_2025_03_27" / "task_pct_v2.csv",
        base_path / "release_2025_03_27" / "automation_vs_augmentation_by_task.csv",
        base_path / "release_2025_09_15" / "data" / "intermediate"
        / "aei_raw_claude_ai_2025-08-04_to_2025-08-11.csv",
        base_path / "release_2025_09_15" / "data" / "intermediate"
        / "aei_raw_1p_api_2025-08-04_to_2025-08-11.csv",
        base_path / "release_2026_01_15" / "data" / "intermediate"
        / "aei_raw_claude_ai_2025-11-13_to_2025-11-20.csv",
        base_path / "release_2026_01_15" / "data" / "intermediate"
        / "aei_raw_1p_api_2025-11-13_to_2025-11-20.csv",
    ]
    existing_for_check = [p for p in source_files_for_check if p.exists()]
    early_hash = compute_files_hash(existing_for_check)

    # Check if any temporal snapshots already exist
    existing = await session.execute(
        select(DatasetVersion).where(
            DatasetVersion.dataset_name == DATASET_NAME,
        )
    )
    existing_row = existing.scalar_one_or_none()
    if existing_row:
        if existing_row.integrity_hash != early_hash:
            raise ValueError(
                f"AEI temporal snapshots already ingested but source data has changed. "
                f"Stored hash: {existing_row.integrity_hash[:16]}... "
                f"New hash: {early_hash[:16]}... "
                "Delete the existing dataset_versions row to force re-ingest."
            )
        raise ValueError("AEI temporal snapshots already ingested (unchanged).")

    logger.info("Starting AEI temporal ingestion from %s", data_path)

    counts: dict[str, int] = {}
    total_rows = 0

    # ── Release 1: 2025-02-10 (Sonnet 3.5) ──
    logger.info("Loading release 2025-02-10 (Sonnet 3.5)...")
    r1_df = _load_release_v1(base_path)
    r1_count = await _insert_snapshot(session, r1_df, RELEASES[0])
    counts["2025-02-10_claude_ai"] = r1_count
    total_rows += r1_count
    logger.info("  %d tasks loaded", r1_count)

    # ── Release 2: 2025-03-27 (Sonnet 3.7) ──
    logger.info("Loading release 2025-03-27 (Sonnet 3.7)...")
    r2_df = _load_release_v2(base_path)
    r2_count = await _insert_snapshot(session, r2_df, RELEASES[1])
    counts["2025-03-27_claude_ai"] = r2_count
    total_rows += r2_count
    logger.info("  %d tasks loaded", r2_count)

    # ── Release 3: 2025-09-15 (Sonnet 4) — Claude.ai + 1P API ──
    logger.info("Loading release 2025-09-15 (Sonnet 4)...")
    r3_claude_df = _load_release_long_format(
        base_path, "release_2025_09_15",
        "aei_raw_claude_ai_2025-08-04_to_2025-08-11.csv",
    )
    r3_claude_count = await _insert_snapshot(session, r3_claude_df, RELEASES[2])
    counts["2025-09-15_claude_ai"] = r3_claude_count
    total_rows += r3_claude_count
    logger.info("  Claude.ai: %d tasks", r3_claude_count)

    r3_api_df = _load_release_long_format(
        base_path, "release_2025_09_15",
        "aei_raw_1p_api_2025-08-04_to_2025-08-11.csv",
    )
    r3_api_count = await _insert_snapshot(session, r3_api_df, API_RELEASES[0])
    counts["2025-09-15_1p_api"] = r3_api_count
    total_rows += r3_api_count
    logger.info("  1P API: %d tasks", r3_api_count)

    # ── Release 4: 2026-01-15 (Sonnet 4.5) — Claude.ai + 1P API ──
    logger.info("Loading release 2026-01-15 (Sonnet 4.5)...")
    r4_claude_df = _load_release_long_format(
        base_path, "release_2026_01_15",
        "aei_raw_claude_ai_2025-11-13_to_2025-11-20.csv",
    )
    r4_claude_count = await _insert_snapshot(session, r4_claude_df, RELEASES[3])
    counts["2026-01-15_claude_ai"] = r4_claude_count
    total_rows += r4_claude_count
    logger.info("  Claude.ai: %d tasks", r4_claude_count)

    r4_api_df = _load_release_long_format(
        base_path, "release_2026_01_15",
        "aei_raw_1p_api_2025-11-13_to_2025-11-20.csv",
    )
    r4_api_count = await _insert_snapshot(session, r4_api_df, API_RELEASES[1])
    counts["2026-01-15_1p_api"] = r4_api_count
    total_rows += r4_api_count
    logger.info("  1P API: %d tasks", r4_api_count)

    # ── Register dataset version (ADR-002) ──
    # Use the hash computed at the start of the function (early_hash)
    version_result = await session.execute(
        insert(DatasetVersion)
        .values(
            dataset_name=DATASET_NAME,
            version_key="all_releases",
            row_count=total_rows,
            integrity_hash=early_hash,
            source_url="https://huggingface.co/datasets/Anthropic/EconomicIndex",
            metadata_={
                "license": "CC-BY",
                "releases": list(counts.keys()),
                "release_counts": counts,
                "model_eras": ["sonnet-3.5", "sonnet-3.7", "sonnet-4", "sonnet-4.5"],
                "platforms": ["claude_ai", "1p_api"],
            },
        )
        .returning(DatasetVersion.id)
    )
    version_id = version_result.scalar_one()

    await session.execute(
        insert(DatasetVersionDelta).values(
            dataset_name=DATASET_NAME,
            from_version_id=None,
            to_version_id=version_id,
            records_added=total_rows,
            records_removed=0,
            records_changed=0,
            delta_detail={"type": "initial_load", "releases": counts},
        )
    )

    await session.commit()

    logger.info("AEI temporal ingestion complete. Total: %d rows across %d snapshots",
                total_rows, len(counts))
    return counts
