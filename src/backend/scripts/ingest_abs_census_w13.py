"""Ingest ABS 2021 Census Working Population Profile — W13.

Source: 2021Census_W13_AUS_POW_AUS.csv
Table:  W13 — Occupation by Sex
        ~51 ANZSCO sub-major groups × 3 sex codes (M/F/P), national (AUS)

Usage:
    python -m scripts.ingest_abs_census_w13
    python -m scripts.ingest_abs_census_w13 --file /custom/path/W13.csv
    python -m scripts.ingest_abs_census_w13 --dry-run

The CSV is wide-format (1 header row + 1 data row for AUS). This script melts it
into long format: one row per (geography × anzsco_submajor × sex).

Column name format: {ANZSCO_MAJOR_ABBREV}_{ANZSCO_SUBMAJOR_ABBREV}_{SEX}
    e.g.  Mng_Spec_Mng_M, Pro_Health_Pro_F, Lab_Clnrs_lndryWs_P

Sex suffix is always the last segment: _M (Male), _F (Female), _P (Persons).
"""

import argparse
import asyncio
import csv
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.utils.hashing import compute_file_hash  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Reference mappings — ANZSCO major group prefixes used in W13 CSV
# ---------------------------------------------------------------------------

# Major group prefix → (ANZSCO 1-digit code, full name)
W13_MAJOR_GROUPS: dict[str, tuple[int, str]] = {
    "Mng": (1, "Managers"),
    "Pro": (2, "Professionals"),
    "TecTW": (3, "Technicians and Trades Workers"),
    "CoPSW": (4, "Community and Personal Service Workers"),
    "ClAW": (5, "Clerical and Administrative Workers"),
    "SWs": (6, "Sales Workers"),
    "MaOpD": (7, "Machinery Operators and Drivers"),
    "Lab": (8, "Labourers"),
}

# Sub-major abbreviation → (ANZSCO 2-digit code or None, full name)
# Keyed by the full "{Major}_{SubMajor}" string as it appears after stripping sex suffix.
# "_TOTAL" sentinel marks subtotal columns that should be skipped.
W13_SUBMAJOR_GROUPS: dict[str, tuple[str | None, str]] = {
    # Managers (1x)
    "Mng_Mng_nfd": (None, "Managers nfd"),
    "Mng_ChiefEx_GMng_legs_": ("11", "Chief Executives, General Managers and Legislators"),
    "Mng_Farmers_FMng": ("12", "Farmers and Farm Managers"),
    "Mng_Spec_Mng": ("13", "Specialist Managers"),
    "Mng_Hosp_ret_svce_Mng": ("14", "Hospitality, Retail and Service Managers"),
    "Mng_Tot": (None, "_TOTAL"),
    # Professionals (2x)
    "Pro_Pro_nfd": (None, "Professionals nfd"),
    "Pro_Arts_media_Pro": ("21", "Arts and Media Professionals"),
    "Pro_Busin_HR_mkting_Pro": ("22", "Business, Human Resource and Marketing Professionals"),
    "Pro_DesEng_sci_tspt_Pro": ("23", "Design, Engineering, Science and Transport Professionals"),
    "Pro_Educ_Pro": ("24", "Education Professionals"),
    "Pro_Health_Pro": ("25", "Health Professionals"),
    "Pro_Inf_Com_Tec_ICT_Pro": ("26", "ICT Professionals"),
    "Pro_Leg_soc_welf_Pro": ("27", "Legal, Social and Welfare Professionals"),
    "Pro_Tot": (None, "_TOTAL"),
    # Technicians and Trades Workers (3x)
    "TecTW_TecTW_nfd": (None, "Technicians and Trades Workers nfd"),
    "TecTW_Eng_ICT_STecs": ("31", "Engineering, ICT and Science Technicians"),
    "TecTW_Auto_eng_tds_wks": ("32", "Automotive and Engineering Trades Workers"),
    "TecTW_Const_tds_wks": ("33", "Construction Trades Workers"),
    "TecTW_EleTec_telco_tds_wks": ("34", "Electrotechnology and Telecommunications Trades Workers"),
    "TecTW_Food_tds_wks": ("35", "Food Trades Workers"),
    "TecTW_Sk_ani_hort_wks": ("36", "Skilled Animal and Horticultural Workers"),
    "TecTW_Oth_TecTW": ("39", "Other Technicians and Trades Workers"),
    "TecTW_Tot": (None, "_TOTAL"),
    # Community and Personal Service Workers (4x)
    "CoPSW_CoPSW_nfd": (None, "Community and Personal Service Workers nfd"),
    "CoPSW_HlthWlfSptWs": ("41", "Health and Welfare Support Workers"),
    "CoPSW_Carers_aides": ("42", "Carers and Aides"),
    "CoPSW_Hosp_wks": ("43", "Hospitality Workers"),
    "CoPSW_ProtecSvcWks": ("44", "Protective Service Workers"),
    "CoPSW_SptsPsnlSvceWs": ("45", "Sports and Personal Service Workers"),
    "CoPSW_Tot": (None, "_TOTAL"),
    # Clerical and Administrative Workers (5x)
    "ClAW_ClAW_nfd": (None, "Clerical and Administrative Workers nfd"),
    "ClAW_OfMngs_ProgAdm": ("51", "Office Managers and Program Administrators"),
    "ClAW_PsnlAs_secretaries": ("52", "Personal Assistants and Secretaries"),
    "ClAW_GnrlClerWs": ("53", "General Clerical Workers"),
    "ClAW_InqClks_recepts": ("54", "Inquiry Clerks and Receptionists"),
    "ClAW_Num_clerks": ("55", "Numerical Clerks"),
    "ClAW_Clerl_OfSuptWs": ("56", "Clerical and Office Support Workers"),
    "ClAW_Oth_ClAW": ("59", "Other Clerical and Administrative Workers"),
    "ClAW_Tot": (None, "_TOTAL"),
    # Sales Workers (6x)
    "SWs_SWs_nfd": (None, "Sales Workers nfd"),
    "SWs_Sales_reps_agnts": ("61", "Sales Representatives and Agents"),
    "SWs_SalesAs_SalesPsns": ("62", "Sales Assistants and Salespersons"),
    "SWs_SalesSptWks": ("63", "Sales Support Workers"),
    "SWs_Tot": (None, "_TOTAL"),
    # Machinery Operators and Drivers (7x)
    "MaOpD_MaOpD_nfd": (None, "Machinery Operators and Drivers nfd"),
    "MaOpD_Ma_StatPlntOps": ("71", "Machine and Stationary Plant Operators"),
    "MaOpD_MobPlntOps": ("72", "Mobile Plant Operators"),
    "MaOpD_RoadRail_dvrs": ("73", "Road and Rail Drivers"),
    "MaOpD_StorPsns": ("74", "Storepersons"),
    "MaOpD_Tot": (None, "_TOTAL"),
    # Labourers (8x)
    "Lab_Lab_nfd": (None, "Labourers nfd"),
    "Lab_Clnrs_lndryWs": ("81", "Cleaners and Laundry Workers"),
    "Lab_Const_and_Min_Lab": ("82", "Construction and Mining Labourers"),
    "Lab_Factory_ProcWs": ("83", "Factory Process Workers"),
    "Lab_FarmFrstyGrdnWs": ("84", "Farm, Forestry and Garden Workers"),
    "Lab_Food_prep_asts": ("85", "Food Preparation Assistants"),
    "Lab_Oth_Lab": ("89", "Other Labourers"),
    "Lab_Tot": (None, "_TOTAL"),
    # Special categories (no major group)
    "Inad_des": (None, "Inadequately Described"),
    "NS": (None, "Not Stated"),
    "Tot": (None, "_TOTAL"),
}

# Pre-compute major group lookup for special categories
_SPECIAL_CATEGORIES = {"Inad_des", "NS", "Tot"}

# Sorted longest-first for suffix matching
_SUBMAJOR_KEYS_ORDERED = sorted(W13_SUBMAJOR_GROUPS.keys(), key=len, reverse=True)

# Valid sex suffixes
_SEX_SUFFIXES = ("_M", "_F", "_P")


def _parse_w13_column(col: str) -> tuple[str, str] | None:
    """Return (submajor_key, sex_code) or None if column should be skipped.

    Strips the sex suffix (_M/_F/_P) then looks up the remaining key
    in W13_SUBMAJOR_GROUPS.
    """
    if col == "POW_AUS_CODE_2021":
        return None

    # Strip sex suffix
    sex_code = None
    base = col
    for suffix in _SEX_SUFFIXES:
        if col.endswith(suffix):
            sex_code = suffix[-1]  # 'M', 'F', or 'P'
            base = col[: -len(suffix)]
            break

    if sex_code is None:
        logger.warning("No sex suffix found in column: %s", col)
        return None

    if base in W13_SUBMAJOR_GROUPS:
        return base, sex_code

    logger.warning("Unknown ANZSCO sub-major key '%s' in column: %s", base, col)
    return None


def _resolve_major_group(submajor_key: str) -> tuple[int | None, str]:
    """Return (major_group_code, major_group_name) for a sub-major key."""
    if submajor_key in _SPECIAL_CATEGORIES:
        return None, submajor_key

    # Find the major prefix by matching against known prefixes (longest first)
    for prefix, (code, name) in sorted(
        W13_MAJOR_GROUPS.items(), key=lambda x: len(x[0]), reverse=True
    ):
        if submajor_key.startswith(prefix + "_") or submajor_key == prefix:
            return code, name

    return None, "Unknown"


def parse_w13(csv_path: Path) -> list[dict]:
    """Parse W13 CSV and return list of row dicts ready for DB insert."""
    rows: list[dict] = []

    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for data_row in reader:
            geography_code = data_row["POW_AUS_CODE_2021"]

            for col, raw_value in data_row.items():
                parsed = _parse_w13_column(col)
                if parsed is None:
                    continue

                submajor_key, sex_code = parsed
                submajor_code, submajor_name = W13_SUBMAJOR_GROUPS[submajor_key]

                # Skip subtotal columns
                if submajor_name == "_TOTAL":
                    continue

                major_code, major_name = _resolve_major_group(submajor_key)

                # ABS applies random adjustment — tiny negatives possible; clamp to 0
                try:
                    employed_count: int | None = max(0, int(raw_value)) if raw_value else None
                except (ValueError, TypeError):
                    employed_count = None

                rows.append(
                    {
                        "geography_code": geography_code,
                        "anzsco_major_group": major_code,
                        "anzsco_major_group_name": major_name,
                        "anzsco_submajor_code": submajor_code,
                        "anzsco_submajor_abbrev": submajor_key,
                        "anzsco_submajor_name": submajor_name,
                        "sex": sex_code,
                        "employed_count": employed_count,
                        "census_year": 2021,
                        "source_table": "W13",
                    }
                )

    return rows


async def ingest(csv_path: Path, dry_run: bool = False) -> int:
    """Load W13 data into abs_census_w13. Returns row count processed."""
    if not csv_path.exists():
        raise FileNotFoundError(f"W13 CSV not found: {csv_path}")

    integrity_hash = compute_file_hash(str(csv_path))
    logger.info("W13 SHA-256: %s", integrity_hash)

    rows = parse_w13(csv_path)
    logger.info("Parsed %d cells from W13", len(rows))

    if dry_run:
        logger.info("Dry run — no DB writes. Sample rows:")
        for r in rows[:5]:
            logger.info("  %s", r)
        # Summary by major group
        from collections import Counter

        major_counts = Counter(r["anzsco_major_group_name"] for r in rows)
        for name, count in major_counts.most_common():
            logger.info("  %s: %d rows", name, count)
        return len(rows)

    for r in rows:
        r["integrity_hash"] = integrity_hash

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            # Check for existing data with hash comparison (ADR-002 integrity pattern)
            existing_count = (
                await session.execute(
                    text("SELECT COUNT(*) FROM abs_census_w13 WHERE census_year = 2021")
                )
            ).scalar()

            if existing_count and existing_count > 0:
                existing_hash = (
                    await session.execute(
                        text(
                            "SELECT integrity_hash FROM abs_census_w13 "
                            "WHERE census_year = 2021 LIMIT 1"
                        )
                    )
                ).scalar()

                if existing_hash == integrity_hash:
                    logger.info(
                        "Hash matches existing %d rows — skipping re-ingest",
                        existing_count,
                    )
                    return existing_count

                logger.info("Source file changed — replacing %d existing rows", existing_count)
                await session.execute(text("DELETE FROM abs_census_w13 WHERE census_year = 2021"))

            await session.execute(
                text(
                    """
                    INSERT INTO abs_census_w13 (
                        geography_code, anzsco_major_group, anzsco_major_group_name,
                        anzsco_submajor_code, anzsco_submajor_abbrev, anzsco_submajor_name,
                        sex, employed_count, census_year, source_table, integrity_hash
                    ) VALUES (
                        :geography_code, :anzsco_major_group, :anzsco_major_group_name,
                        :anzsco_submajor_code, :anzsco_submajor_abbrev, :anzsco_submajor_name,
                        :sex, :employed_count, :census_year, :source_table, :integrity_hash
                    )
                    """
                ),
                rows,
            )
            await session.commit()

            final_count = (
                await session.execute(
                    text("SELECT COUNT(*) FROM abs_census_w13 WHERE census_year = 2021")
                )
            ).scalar()
            logger.info("abs_census_w13 now contains %d rows", final_count)

    finally:
        await engine.dispose()

    return len(rows)


async def run(file: str | Path | None = None, dry_run: bool = False) -> int:
    """Ingest ABS Census 2021 W13. Returns row count.

    Shared entry point for the CLI and the pipeline orchestrator.
    """
    csv_path = Path(file) if file else Path(settings.census_w13_file)
    return await ingest(csv_path, dry_run=dry_run)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest ABS 2021 Census WPP W13")
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Path to 2021Census_W13_AUS_POW_AUS.csv (default: from settings)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and log without writing to DB",
    )
    args = parser.parse_args()

    count = await run(args.file, dry_run=args.dry_run)
    logger.info("Done — %d rows processed", count)


if __name__ == "__main__":
    asyncio.run(main())
