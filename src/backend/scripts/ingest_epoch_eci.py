"""Ingest Epoch AI Capabilities Index (ECI) benchmark data into gptval_benchmarks.

Downloads the ECI CSV from epoch.ai at runtime (CC-BY licence, no registration).
Filters to frontier model groups relevant to the platform's model era taxonomy
and loads into the gptval_benchmarks table.

Source:  https://epoch.ai/data/eci_benchmarks.csv
Licence: Creative Commons Attribution 4.0 (CC-BY)
Updated: Regularly — re-run to pick up new model releases

Dataset (DataScout P0a, ADR-006):
  - 1,400+ rows across 40 benchmarks and 160+ model groups
  - Covers Claude, GPT, Gemini, Llama, Mixtral, and open-weight models
  - Date range from ~2023 to present

Model era mapping (platform taxonomy → ECI model_group values):
  The platform tracks AI capability by model generation. ECI uses free-text
  model_group names; we normalise to stable era keys for JOIN with other tables.

Usage:
    python -m scripts.ingest_epoch_eci [--data-version <tag>] [--all-models]

    --data-version : optional tag to label this ingest (default: file last-modified date)
    --all-models   : ingest all 160+ model groups, not just platform-curated subset
"""

import argparse
import asyncio
import io
import logging
import sys
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings  # noqa: E402
from app.models.infrastructure import DatasetVersion, DatasetVersionDelta  # noqa: E402
from app.utils.hashing import compute_bytes_hash  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ECI_URL = "https://epoch.ai/data/eci_benchmarks.csv"
DATASET_NAME = "epoch_eci"

# Platform era taxonomy — maps ECI model_group to a stable era key.
# Extend this dict as new model generations are released.
ERA_MAP: dict[str, str] = {
    # Claude
    "Claude Instant": "claude-1",
    "Claude 2": "claude-2",
    "Claude 2.1": "claude-2",
    "Claude 3 Haiku": "claude-3-haiku",
    "Claude 3 Sonnet": "claude-3-sonnet",
    "Claude 3 Opus": "claude-3-opus",
    "Claude 3.5 Haiku": "claude-3.5-haiku",
    "Claude 3.5 Sonnet": "claude-3.5-sonnet",
    "Claude 3.5 Sonnet (October 2024)": "claude-3.5-sonnet",
    "Claude 3.7 Sonnet": "claude-3.7-sonnet",
    "Claude Sonnet 4": "claude-4-sonnet",
    "Claude Sonnet 4.5": "claude-4.5-sonnet",
    "Claude Sonnet 4.6": "claude-4.6-sonnet",
    "Claude Haiku 4.5": "claude-4.5-haiku",
    "Claude Opus 4": "claude-4-opus",
    "Claude Opus 4.1": "claude-4.1-opus",
    "Claude Opus 4.5": "claude-4.5-opus",
    "Claude Opus 4.6": "claude-4.6-opus",
    # GPT
    "GPT-3.5": "gpt-3.5",
    "GPT-4": "gpt-4",
    "GPT-4o": "gpt-4o",
    "GPT-4o mini": "gpt-4o-mini",
    "GPT-4.1": "gpt-4.1",
    "GPT-4.5": "gpt-4.5",
    "o1": "o1",
    "o1-mini": "o1-mini",
    "o3": "o3",
    "o3-mini": "o3-mini",
    "o4-mini": "o4-mini",
    # Gemini
    "Gemini 1.0 Pro": "gemini-1.0-pro",
    "Gemini 1.5 Pro": "gemini-1.5-pro",
    "Gemini 1.5 Flash": "gemini-1.5-flash",
    "Gemini 2.0 Flash": "gemini-2.0-flash",
    "Gemini 2.0 Flash Thinking": "gemini-2.0-flash-thinking",
    "Gemini 2.5 Pro": "gemini-2.5-pro",
    # Open-weight frontier (for comparison)
    "Llama 3 8B": "llama-3-8b",
    "Llama 3 70B": "llama-3-70b",
    "Llama 3 405B": "llama-3-405b",
    "Llama 3.1 8B": "llama-3.1-8b",
    "Llama 3.1 70B": "llama-3.1-70b",
    "Llama 3.1 405B": "llama-3.1-405b",
    "Llama 3.3 70B": "llama-3.3-70b",
    "Llama 4 Scout": "llama-4-scout",
    "Llama 4 Maverick": "llama-4-maverick",
    "DeepSeek-V2": "deepseek-v2",
    "DeepSeek-V3": "deepseek-v3",
    "DeepSeek-R1": "deepseek-r1",
    "Mixtral 8x7B": "mixtral-8x7b",
    "Mixtral 8x22B": "mixtral-8x22b",
}


def _download_eci_csv() -> tuple[bytes, str]:
    """Download ECI CSV, return (bytes, last-modified date string)."""
    logger.info("Downloading ECI benchmark data from %s", ECI_URL)
    request = urllib.request.Request(  # noqa: S310
        ECI_URL,
        headers={"User-Agent": "Mozilla/5.0 (compatible; skillcurrent/0.1)"},
    )
    with urllib.request.urlopen(request, timeout=30) as resp:  # noqa: S310
        csv_bytes = resp.read()
        last_modified = resp.headers.get("last-modified", "unknown")
    logger.info("Downloaded %d bytes, last-modified: %s", len(csv_bytes), last_modified)
    return csv_bytes, last_modified


def _parse_and_filter(csv_bytes: bytes, all_models: bool) -> pd.DataFrame:
    """Parse ECI CSV and filter/normalise rows."""
    df = pd.read_csv(io.StringIO(csv_bytes.decode("utf-8")))
    logger.info("Parsed %d ECI rows across %d model groups", len(df), df["model_group"].nunique())

    if not all_models:
        # Filter to platform era taxonomy only
        df = df[df["model_group"].isin(ERA_MAP)]
        logger.info("Filtered to %d platform-relevant rows", len(df))

    # Map to era key
    df["model_era"] = (
        df["model_group"].map(ERA_MAP).fillna(df["model_group"].str.lower().str.replace(" ", "-"))
    )

    # Parse date column — some rows may be empty
    df["measurement_date"] = pd.to_datetime(df["date"], errors="coerce").dt.date

    # Normalise performance to float (already float, but be explicit)
    df["score"] = pd.to_numeric(df["performance"], errors="coerce")

    # Boolean category columns. Epoch dropped is_math/is_coding from the CSV
    # (upstream schema drift, 2026) — guard for their absence and store NULL
    # rather than fabricate categories. Waterline velocity per benchmark does
    # not depend on them; they are optional filter flags only.
    _bool_map = {"True": True, "False": False, True: True, False: False}
    for _col in ("is_math", "is_coding"):
        df[_col] = df[_col].map(_bool_map) if _col in df.columns else None

    # Drop rows with no score
    missing_score = df["score"].isna().sum()
    if missing_score > 0:
        logger.warning("Dropping %d rows with missing score", missing_score)
        df = df.dropna(subset=["score"])

    return df


async def ingest(
    session: AsyncSession,
    all_models: bool = False,
    data_version: str | None = None,
) -> dict[str, int]:
    """Download and ingest Epoch AI ECI benchmark data.

    Args:
        session: Async database session.
        all_models: If True, ingest all 160+ model groups; otherwise filter to
                    platform era taxonomy only (curated subset, default).
        data_version: Optional version tag. Defaults to today's date (YYYY-MM-DD).

    Returns:
        Dict with table name and row count.
    """
    csv_bytes, last_modified = _download_eci_csv()
    integrity_hash = compute_bytes_hash(csv_bytes)

    # Default version tag to today
    version = data_version or date.today().strftime("%Y-%m-%d")

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
                f"Epoch ECI version {version} already ingested but source data has changed. "
                f"Stored: {existing_row.integrity_hash[:16]}... New: {integrity_hash[:16]}... "
                "Use a new --data-version tag or delete the existing dataset_versions row."
            )
        raise ValueError(f"Epoch ECI version {version} already ingested (unchanged).")

    df = _parse_and_filter(csv_bytes, all_models)

    # Register version
    model_groups_ingested = sorted(df["model_group"].unique().tolist())
    version_result = await session.execute(
        insert(DatasetVersion)
        .values(
            dataset_name=DATASET_NAME,
            version_key=version,
            row_count=len(df),
            integrity_hash=integrity_hash,
            source_url=ECI_URL,
            metadata_={
                "last_modified": last_modified,
                "benchmarks": int(df["benchmark"].nunique()),
                "model_groups": int(df["model_group"].nunique()),
                "all_models": all_models,
                "model_groups_ingested": model_groups_ingested[:30],  # cap for JSON
                "score_range": [float(df["score"].min()), float(df["score"].max())],
                "date_range": [
                    str(df["measurement_date"].min()),
                    str(df["measurement_date"].max()),
                ],
            },
        )
        .returning(DatasetVersion.id)
    )
    version_id = version_result.scalar_one()
    await session.flush()
    logger.info("Registered Epoch ECI as dataset_version id=%d", version_id)

    # Build insert rows
    rows = []
    for _, row in df.iterrows():
        mdate = row["measurement_date"]
        rows.append(
            {
                "benchmark": str(row["benchmark"]),
                "model_group": str(row["model_group"]),
                "model_era": str(row["model_era"]),
                "measurement_date": mdate if not pd.isna(mdate) else None,
                "score": float(row["score"]),
                "is_math": bool(row["is_math"]) if pd.notna(row["is_math"]) else None,
                "is_coding": bool(row["is_coding"]) if pd.notna(row["is_coding"]) else None,
                "source_ref": str(row["source"])[:500] if pd.notna(row.get("source")) else None,
                "dataset_version": version,
            }
        )

    logger.info("Loading %d ECI benchmark rows...", len(rows))
    await session.execute(
        text(
            "INSERT INTO gptval_benchmarks "
            "(benchmark, model_group, model_era, measurement_date, score, "
            "is_math, is_coding, source_ref, dataset_version) "
            "VALUES (:benchmark, :model_group, :model_era, :measurement_date, :score, "
            ":is_math, :is_coding, :source_ref, :dataset_version) "
            "ON CONFLICT (benchmark, model_group, dataset_version) DO NOTHING"
        ),
        rows,
    )

    counts = {"gptval_benchmarks": len(rows)}

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
    logger.info("Epoch ECI ingestion complete: %d rows loaded", len(rows))
    return counts


async def run(all_models: bool = False, data_version: str | None = None) -> int:
    """Download + ingest Epoch ECI benchmarks. Returns rows loaded.

    Shared entry point for the CLI and the pipeline orchestrator. Idempotent:
    if this version is already ingested unchanged, logs and returns the existing
    ``gptval_benchmarks`` row count instead of raising, so a rebuild is resumable.
    """
    engine = create_async_engine(settings.database_url)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with session_factory() as session:
            try:
                counts = await ingest(session, all_models=all_models, data_version=data_version)
                total = sum(counts.values())
            except ValueError as exc:
                if "already ingested" not in str(exc):
                    raise
                logger.info("Epoch ECI already ingested — skipping (%s)", exc)
                existing = await session.execute(text("SELECT COUNT(*) FROM gptval_benchmarks"))
                total = int(existing.scalar() or 0)
        print(f"\nEpoch ECI: {total:,} rows in gptval_benchmarks")
        return total
    finally:
        await engine.dispose()


async def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Epoch AI ECI benchmark data")
    parser.add_argument("--data-version", help="Version tag (default: today's date)")
    parser.add_argument(
        "--all-models",
        action="store_true",
        help="Ingest all model groups, not just platform-curated subset",
    )
    args = parser.parse_args()
    await run(all_models=args.all_models, data_version=args.data_version)


if __name__ == "__main__":
    asyncio.run(main())
