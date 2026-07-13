"""GDPval benchmark ingestion — OpenAI real-world knowledge tasks.

Ingests the GDPval dataset (220 tasks × 44 occupations × 9 NAICS sectors)
into gdpval_tasks, gdpval_rubric_items, and registers in dataset_versions.

Each task includes a detailed evaluation rubric with scored criteria.
When model evaluation scores are later added to gdpval_evaluations,
this enables longitudinal waterline tracking per occupation (FR-8.7).

Source: https://huggingface.co/datasets/openai/gdpval
"""

import json
import logging
from pathlib import Path

import pandas as pd
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion, DatasetVersionDelta
from app.utils.hashing import compute_file_hash

logger = logging.getLogger(__name__)

DATASET_NAME = "gdpval"

# Manual SOC code mapping for all 44 GDPval occupations.
# 43 are exact O*NET title matches; 1 fuzzy match is hardcoded.
SOC_MAPPING: dict[str, str] = {
    "Accountants and Auditors": "13-2011.00",
    "Administrative Services Managers": "11-3012.00",
    "Audio and Video Technicians": "27-4011.00",
    "Buyers and Purchasing Agents": "13-1023.00",  # Manufacturing context → non-farm/retail
    "Child, Family, and School Social Workers": "21-1021.00",
    "Compliance Officers": "13-1041.00",
    "Computer and Information Systems Managers": "11-3021.00",
    "Concierges": "39-6012.00",
    "Counter and Rental Clerks": "41-2021.00",
    "Customer Service Representatives": "43-4051.00",
    "Editors": "27-3041.00",
    "Film and Video Editors": "27-4032.00",
    "Financial Managers": "11-3031.00",
    "Financial and Investment Analysts": "13-2051.00",
    "First-Line Supervisors of Non-Retail Sales Workers": "41-1012.00",
    "First-Line Supervisors of Office and Administrative Support Workers": "43-1011.00",
    "First-Line Supervisors of Police and Detectives": "33-1012.00",
    "First-Line Supervisors of Production and Operating Workers": "51-1011.00",
    "First-Line Supervisors of Retail Sales Workers": "41-1011.00",
    "General and Operations Managers": "11-1021.00",
    "Industrial Engineers": "17-2112.00",
    "Lawyers": "23-1011.00",
    "Mechanical Engineers": "17-2141.00",
    "Medical Secretaries and Administrative Assistants": "43-6013.00",
    "Medical and Health Services Managers": "11-9111.00",
    "News Analysts, Reporters, and Journalists": "27-3023.00",
    "Nurse Practitioners": "29-1171.00",
    "Order Clerks": "43-4151.00",
    "Personal Financial Advisors": "13-2052.00",
    "Pharmacists": "29-1051.00",
    "Private Detectives and Investigators": "33-9021.00",
    "Producers and Directors": "27-2012.00",
    "Project Management Specialists": "13-1082.00",
    "Property, Real Estate, and Community Association Managers": "11-9141.00",
    "Real Estate Brokers": "41-9021.00",
    "Real Estate Sales Agents": "41-9022.00",
    "Recreation Workers": "39-9032.00",
    "Registered Nurses": "29-1141.00",
    "Sales Managers": "11-2022.00",
    "Sales Representatives, Wholesale and Manufacturing, Except Technical and Scientific Products": "41-4012.00",
    "Sales Representatives, Wholesale and Manufacturing, Technical and Scientific Products": "41-4011.00",
    "Securities, Commodities, and Financial Services Sales Agents": "41-3031.00",
    "Shipping, Receiving, and Inventory Clerks": "43-5071.00",
    "Software Developers": "15-1252.00",
}


def _parse_rubric(rubric_raw: str | list) -> list[dict]:
    """Parse rubric_json from parquet (may be string or list)."""
    if isinstance(rubric_raw, str):
        return json.loads(rubric_raw)
    if isinstance(rubric_raw, list):
        return rubric_raw
    return []


def _count_files(file_field: str | list | None) -> int:
    """Count files from a parquet list field."""
    if file_field is None:
        return 0
    if isinstance(file_field, list):
        return len(file_field)
    if isinstance(file_field, str):
        try:
            parsed = json.loads(file_field)
            return len(parsed) if isinstance(parsed, list) else 0
        except (json.JSONDecodeError, TypeError):
            return 0
    return 0


async def ingest_gdpval(
    session: AsyncSession,
    data_path: str,
) -> dict[str, int]:
    """Ingest GDPval benchmark tasks and rubrics.

    Args:
        session: Async database session.
        data_path: Path to GDPval data directory containing the parquet file.

    Returns:
        Dict with task_count and rubric_item_count.
    """
    base_path = Path(data_path)
    parquet_path = base_path / "data" / "train-00000-of-00001.parquet"

    if not parquet_path.is_file():
        raise FileNotFoundError(f"GDPval parquet not found: {parquet_path}")

    # Compute integrity hash before checking existing version
    file_hash = compute_file_hash(parquet_path)

    # Check idempotency
    existing = await session.execute(
        select(DatasetVersion).where(DatasetVersion.dataset_name == DATASET_NAME)
    )
    existing_row = existing.scalar_one_or_none()
    if existing_row:
        if existing_row.integrity_hash != file_hash:
            raise ValueError(
                f"GDPval benchmark data already ingested but source data has changed. "
                f"Stored hash: {existing_row.integrity_hash[:16]}... "
                f"New hash: {file_hash[:16]}... "
                "Delete the existing dataset_versions row to force re-ingest."
            )
        raise ValueError("GDPval benchmark data already ingested (unchanged).")

    logger.info("Loading GDPval from %s", parquet_path)
    df = pd.read_parquet(parquet_path)
    logger.info("Loaded %d tasks across %d occupations", len(df), df["occupation"].nunique())

    # ── Insert tasks ──
    task_rows = []
    rubric_rows = []
    unmapped = set()

    for _, row in df.iterrows():
        occupation = row["occupation"]
        soc_code = SOC_MAPPING.get(occupation)
        if soc_code is None:
            unmapped.add(occupation)

        rubric = _parse_rubric(row["rubric_json"])
        positive_scores = sum(r["score"] for r in rubric if r["score"] > 0)
        negative_scores = sum(r["score"] for r in rubric if r["score"] < 0)

        task_rows.append(
            {
                "task_id": row["task_id"],
                "occupation_title": occupation,
                "onet_soc": soc_code,
                "sector": row["sector"],
                "prompt": row["prompt"],
                "rubric_item_count": len(rubric),
                "max_score": positive_scores,
                "min_score": negative_scores,
                "reference_file_count": _count_files(row.get("reference_files")),
                "deliverable_file_count": _count_files(row.get("deliverable_files")),
            }
        )

        for item in rubric:
            tags = item.get("tags")
            tags_str = json.dumps(tags) if tags else None

            rubric_rows.append(
                {
                    "task_id": row["task_id"],
                    "rubric_item_id": item.get("rubric_item_id", ""),
                    "score": item["score"],
                    "criterion": item["criterion"],
                    "required": bool(item.get("required", False)),
                    "author_type": item.get("author_type", "human"),
                    "tags": tags_str,
                }
            )

    if unmapped:
        logger.warning("Unmapped occupations: %s", unmapped)

    # Batch insert tasks
    logger.info("Inserting %d tasks...", len(task_rows))
    task_cols = list(task_rows[0].keys())
    task_sql = text(
        f"INSERT INTO gdpval_tasks ({', '.join(task_cols)}) "
        f"VALUES ({', '.join(f':{c}' for c in task_cols)})"
    )
    await session.execute(task_sql, task_rows)

    # Batch insert rubric items
    logger.info("Inserting %d rubric items...", len(rubric_rows))
    rubric_cols = list(rubric_rows[0].keys())
    rubric_sql = text(
        f"INSERT INTO gdpval_rubric_items ({', '.join(rubric_cols)}) "
        f"VALUES ({', '.join(f':{c}' for c in rubric_cols)})"
    )
    batch_size = 5000
    for i in range(0, len(rubric_rows), batch_size):
        await session.execute(rubric_sql, rubric_rows[i : i + batch_size])

    # ── Register dataset version (ADR-002) ──
    version_result = await session.execute(
        insert(DatasetVersion)
        .values(
            dataset_name=DATASET_NAME,
            version_key="v1.0",
            row_count=len(task_rows),
            integrity_hash=file_hash,
            source_url="https://huggingface.co/datasets/openai/gdpval",
            metadata_={
                "license": "MIT",
                "occupations": len(SOC_MAPPING),
                "sectors": sorted(df["sector"].unique().tolist()),
                "tasks_per_occupation": 5,
                "total_rubric_items": len(rubric_rows),
                "soc_mapping_method": "exact_onet_title_match",
                "unmapped_occupations": sorted(unmapped),
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
            records_added=len(task_rows),
            records_removed=0,
            records_changed=0,
            delta_detail={
                "type": "initial_load",
                "tasks": len(task_rows),
                "rubric_items": len(rubric_rows),
            },
        )
    )

    await session.commit()

    counts = {
        "task_count": len(task_rows),
        "rubric_item_count": len(rubric_rows),
    }
    logger.info(
        "GDPval ingestion complete: %d tasks, %d rubric items",
        counts["task_count"],
        counts["rubric_item_count"],
    )
    return counts
