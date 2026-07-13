"""Ingest ABS employment data from JSA Occupation Profiles Excel.

Combines:
  - Table_1: Employment per ANZSCO unit group (national totals)
  - Table_5: Top 3 ANZSIC industries per occupation (ranked)

Distributes employment across top 3 industries using rank-weighted
split (50/30/20%) to create synthetic occupation × industry rows.

Usage:
    python -m scripts.ingest_abs

Data files:
    C:/Users/royst/Projects/Data/ABS/Occupation profiles data - November 2025 (Revised).xlsx
"""

import asyncio
import logging
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings  # noqa: E402
from app.models.infrastructure import DatasetVersion, DatasetVersionDelta  # noqa: E402
from app.utils.hashing import compute_file_hash  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ANZSIC division name → code mapping
ANZSIC_NAME_TO_CODE = {
    "Agriculture, Forestry and Fishing": "A",
    "Mining": "B",
    "Manufacturing": "C",
    "Electricity, Gas, Water and Waste Services": "D",
    "Construction": "E",
    "Wholesale Trade": "F",
    "Retail Trade": "G",
    "Accommodation and Food Services": "H",
    "Transport, Postal and Warehousing": "I",
    "Information Media and Telecommunications": "J",
    "Financial and Insurance Services": "K",
    "Rental, Hiring and Real Estate Services": "L",
    "Professional, Scientific and Technical Services": "M",
    "Administrative and Support Services": "N",
    "Public Administration and Safety": "O",
    "Education and Training": "P",
    "Health Care and Social Assistance": "Q",
    "Arts and Recreation Services": "R",
    "Other Services": "S",
}

# Rank-weighted employment split for top 3 industries
RANK_WEIGHTS = [0.50, 0.30, 0.20]

RELEASE_YEAR = 2025


def load_employment(occ_file: Path) -> pd.DataFrame:
    """Load Table_1 — employment per ANZSCO occupation."""
    logger.info("Reading Table_1 (employment by occupation)...")
    df = pd.read_excel(occ_file, sheet_name="Table_1", header=None, skiprows=6)
    df.columns = [
        "anzsco_code",
        "occupation",
        "employed",
        "pt_share",
        "female_share",
        "median_weekly",
        "median_age",
        "annual_growth",
        "c8",
        "c9",
    ]
    df = df[df["anzsco_code"].apply(lambda x: str(x).isdigit() if pd.notna(x) else False)]
    df["anzsco_code"] = df["anzsco_code"].astype(int).astype(str)
    df["employed"] = pd.to_numeric(df["employed"], errors="coerce").fillna(0).astype(int)
    df["median_weekly"] = pd.to_numeric(df["median_weekly"], errors="coerce")

    logger.info("  %d occupations, %s total employment", len(df), f"{df['employed'].sum():,}")
    return df[["anzsco_code", "occupation", "employed", "median_weekly"]]


def load_industries(occ_file: Path) -> pd.DataFrame:
    """Load Table_5 — top 3 industries per occupation."""
    logger.info("Reading Table_5 (top industries per occupation)...")
    df = pd.read_excel(occ_file, sheet_name="Table_5", header=None, skiprows=6)
    df.columns = ["anzsco_code", "occupation", "industry", "c3", "c4"]
    df = df[df["anzsco_code"].apply(lambda x: str(x).isdigit() if pd.notna(x) else False)]
    df["anzsco_code"] = df["anzsco_code"].astype(int).astype(str)

    # Add rank within each occupation (1=top, 2=second, 3=third)
    df["rank"] = df.groupby("anzsco_code").cumcount()

    logger.info("  %d rows, %d unique occupations", len(df), df["anzsco_code"].nunique())
    return df[["anzsco_code", "industry", "rank"]]


def build_employment_rows(
    emp_df: pd.DataFrame,
    ind_df: pd.DataFrame,
) -> list[dict]:
    """Distribute employment across top 3 industries per occupation.

    Uses rank-weighted split: 50%/30%/20% for rank 0/1/2.
    """
    rows = []

    # Index employment by ANZSCO code
    emp_by_code = emp_df.set_index("anzsco_code").to_dict("index")

    for anzsco_code, group in ind_df.groupby("anzsco_code"):
        occ_data = emp_by_code.get(anzsco_code)
        if not occ_data:
            continue

        total_emp = occ_data["employed"]
        median_weekly = occ_data.get("median_weekly")

        # Compute annual wage from weekly (× 52)
        median_annual = int(median_weekly * 52) if pd.notna(median_weekly) else None

        for _, ind_row in group.iterrows():
            industry_name = ind_row["industry"]
            rank = int(ind_row["rank"])

            # Skip NaN industries (some occupations have <3 industries listed)
            if pd.isna(industry_name):
                continue

            anzsic_code = ANZSIC_NAME_TO_CODE.get(str(industry_name).strip())
            if not anzsic_code:
                logger.warning("  Unknown industry: '%s' (skipped)", industry_name)
                continue

            weight = RANK_WEIGHTS[rank] if rank < len(RANK_WEIGHTS) else 0.0
            allocated_emp = int(total_emp * weight)

            if allocated_emp > 0:
                rows.append(
                    {
                        "anzsco_code": anzsco_code,
                        "anzsco_title": occ_data.get("occupation", ""),
                        "anzsic_code": anzsic_code,
                        "anzsic_title": industry_name,
                        "employment": allocated_emp,
                        "median_annual_wage": median_annual,
                        "release_year": RELEASE_YEAR,
                    }
                )

    return rows


async def run(file: str | Path | None = None) -> int:
    """Ingest ABS/JSA employment data. Returns rows loaded.

    Shared entry point for the CLI and the pipeline orchestrator. Idempotent:
    if this version is already ingested unchanged, returns the existing row count.
    """
    occ_file = Path(file) if file else Path(settings.abs_occupation_profiles_file)
    if not occ_file.exists():
        raise FileNotFoundError(f"ABS occupation profiles file not found: {occ_file}")

    # Load source data
    emp_df = load_employment(occ_file)
    ind_df = load_industries(occ_file)

    # Build employment rows
    logger.info("Distributing employment across industries (50/30/20 rank weights)...")
    rows = build_employment_rows(emp_df, ind_df)
    logger.info("  %d employment rows generated", len(rows))

    # Compute integrity hash from the source file
    integrity_hash = compute_file_hash(occ_file)

    # Insert into database
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if version already registered
        existing = await session.execute(
            select(DatasetVersion).where(
                DatasetVersion.dataset_name == "abs_employment",
                DatasetVersion.version_key == "nov-2025-revised",
            )
        )
        existing_row = existing.scalar_one_or_none()
        if existing_row:
            if existing_row.integrity_hash != integrity_hash:
                raise ValueError(
                    "abs_employment version nov-2025-revised already ingested but source data has changed. "
                    f"Stored hash: {existing_row.integrity_hash[:16]}... "
                    f"New hash: {integrity_hash[:16]}... "
                    "Delete the existing dataset_versions row to force re-ingest."
                )
            # Idempotent skip — hash unchanged, so the load is resumable.
            logger.info("abs_employment already ingested (unchanged) — skipping.")
            await engine.dispose()
            return int(existing_row.row_count)

        # Clear existing ABS data for this release year
        await session.execute(
            text("DELETE FROM abs_employment WHERE release_year = :year"),
            {"year": RELEASE_YEAR},
        )

        # Bulk insert
        logger.info("Inserting %d rows into abs_employment...", len(rows))
        insert_sql = text(
            """
            INSERT INTO abs_employment
                (anzsco_code, anzsco_title, anzsic_code, anzsic_title,
                 employment, median_annual_wage, release_year)
            VALUES
                (:anzsco_code, :anzsco_title, :anzsic_code, :anzsic_title,
                 :employment, :median_annual_wage, :release_year)
        """
        )

        batch_size = 500
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            await session.execute(insert_sql, batch)

        # Register dataset version (ADR-002)
        version_result = await session.execute(
            insert(DatasetVersion)
            .values(
                dataset_name="abs_employment",
                version_key="nov-2025-revised",
                row_count=len(rows),
                integrity_hash=integrity_hash,
                source_url="https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles",
                metadata_={
                    "notes": (
                        "JSA Occupation Profiles Nov 2025 (Revised). "
                        "Employment distributed across top 3 industries per occupation "
                        "using 50/30/20 rank weights."
                    ),
                    "source_file": occ_file.name,
                    "release_year": RELEASE_YEAR,
                },
            )
            .returning(DatasetVersion.id)
        )
        version_id = version_result.scalar_one()
        await session.flush()

        # Record version delta
        await session.execute(
            insert(DatasetVersionDelta).values(
                dataset_name="abs_employment",
                from_version_id=None,
                to_version_id=version_id,
                records_added=len(rows),
                records_removed=0,
                records_changed=0,
                delta_detail={"type": "initial_load", "tables": {"abs_employment": len(rows)}},
            )
        )

        await session.commit()

        # Verify
        r = await session.execute(
            text(
                """
            SELECT anzsic_code, anzsic_title, COUNT(*) AS occupations, SUM(employment) AS total_emp
            FROM abs_employment
            WHERE release_year = :year
            GROUP BY anzsic_code, anzsic_title
            ORDER BY SUM(employment) DESC
        """
            ),
            {"year": RELEASE_YEAR},
        )

        print(f"\n{'Code':<6} {'ANZSIC Division':<50} {'Occs':>6} {'Employment':>12}")
        print("-" * 78)
        total_emp = 0
        total_occs = 0
        for row in r.fetchall():
            print(f"{row[0]:<6} {row[1]:<50} {row[2]:>6} {row[3]:>12,}")
            total_emp += row[3]
            total_occs += row[2]
        print("-" * 78)
        print(f"{'':6} {'TOTAL':<50} {total_occs:>6} {total_emp:>12,}")

    await engine.dispose()
    logger.info("ABS employment ingestion complete.")
    return len(rows)


async def main(file: str | None = None) -> None:
    await run(file)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest ABS/JSA employment data")
    parser.add_argument(
        "--file",
        default=None,
        help="Path to the Occupation profiles .xlsx (default: from settings)",
    )
    args = parser.parse_args()
    asyncio.run(main(args.file))
