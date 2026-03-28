"""Ingest ABS 2021 Census Working Population Profile — W12A.

Source: 2021Census_W12A_AUS_POW_AUS.csv
Table:  W12A — Industry of Employment by Occupation
        19 ANZSIC divisions × 8 ANZSCO major groups + not-stated, national (AUS)

Usage:
    python -m scripts.ingest_abs_census_wpp
    python -m scripts.ingest_abs_census_wpp --file /custom/path/W12A.csv
    python -m scripts.ingest_abs_census_wpp --dry-run

The CSV is wide-format (1 header row + 1 data row for AUS). This script melts it
into long format: one row per (geography × anzsic_division × anzsco_major_group).

Column name format: {ANZSIC_ABBREV}_{ANZSCO_ABBREV}
    e.g.  AgFF_Mng, HltHC_SA_Pro, ProSTS_Tech_trds_wks
    Note: some ANZSIC abbreviations contain underscores (HltHC_SA, ProSTS) so we
    cannot split on the first underscore. Instead we match against known ANZSCO
    suffixes (longest first) to isolate the ANZSIC prefix.
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
# Reference mappings
# ---------------------------------------------------------------------------

# WPP abbreviation → (ANZSIC division letter, full name)
ANZSIC_DIVISIONS: dict[str, tuple[str, str]] = {
    "AgFF": ("A", "Agriculture, Forestry and Fishing"),
    "Min": ("B", "Mining"),
    "Mnf": ("C", "Manufacturing"),
    "EGWWS": ("D", "Electricity, Gas, Water and Waste Services"),
    "Const": ("E", "Construction"),
    "WST": ("F", "Wholesale Trade"),
    "RetT": ("G", "Retail Trade"),
    "AcFd": ("H", "Accommodation and Food Services"),
    "TPW": ("I", "Transport, Postal and Warehousing"),
    "IMT": ("J", "Information Media and Telecommunications"),
    "FinIns": ("K", "Financial and Insurance Services"),
    "RHRE": ("L", "Rental, Hiring and Real Estate Services"),
    "ProSTS": ("M", "Professional, Scientific and Technical Services"),
    "AdSup": ("N", "Administrative and Support Services"),
    "PubAS": ("O", "Public Administration and Safety"),
    "EdTrn": ("P", "Education and Training"),
    "HltHC_SA": ("Q", "Health Care and Social Assistance"),
    "ArtsR": ("R", "Arts and Recreation Services"),
    "OthSvs": ("S", "Other Services"),
    "IDNS": ("X", "Industry Not Stated"),
}

# WPP abbreviation → (ANZSCO 1-digit code or None, full name)
# "_TOTAL" sentinel marks subtotal columns that should be skipped
ANZSCO_MAJOR_GROUPS: dict[str, tuple[int | None, str]] = {
    "Mng": (1, "Managers"),
    "Pro": (2, "Professionals"),
    "Tech_trds_wks": (3, "Technicians and Trades Workers"),
    "Com_persl_svce_wks": (4, "Community and Personal Service Workers"),
    "Cler_admin_wks": (5, "Clerical and Administrative Workers"),
    "Sales_wks": (6, "Sales Workers"),
    "Mach_ops_dvrs": (7, "Machinery Operators and Drivers"),
    "Labourers": (8, "Labourers"),
    "IDNS": (None, "Occupation Not Stated"),
    "Tot": (None, "_TOTAL"),  # skip — derived subtotal
}

# Longest suffixes first so multi-word matches win over shorter partial ones
_ANZSCO_SUFFIXES_ORDERED = sorted(ANZSCO_MAJOR_GROUPS.keys(), key=len, reverse=True)


def _parse_column(col: str) -> tuple[str, str] | None:
    """Return (anzsic_abbrev, anzsco_abbrev) or None if column should be skipped.

    Cannot simply split on '_' because some ANZSIC abbreviations contain
    underscores (e.g. HltHC_SA). Strategy: try each known ANZSCO suffix as a
    right-hand match, working longest-first to avoid partial matches.
    """
    if col == "POW_AUS_CODE_2021":
        return None

    for anzsco_abbrev in _ANZSCO_SUFFIXES_ORDERED:
        suffix = f"_{anzsco_abbrev}"
        if col.endswith(suffix):
            anzsic_abbrev = col[: -len(suffix)]
            if anzsic_abbrev in ANZSIC_DIVISIONS:
                return anzsic_abbrev, anzsco_abbrev
            logger.warning("Unknown ANZSIC prefix '%s' in column: %s", anzsic_abbrev, col)
            return None

    logger.warning("Could not parse column: %s", col)
    return None


def parse_w12a(csv_path: Path) -> list[dict]:
    """Parse W12A CSV and return list of row dicts ready for DB insert."""
    rows: list[dict] = []

    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for data_row in reader:
            geography_code = data_row["POW_AUS_CODE_2021"]

            for col, raw_value in data_row.items():
                parsed = _parse_column(col)
                if parsed is None:
                    continue

                anzsic_abbrev, anzsco_abbrev = parsed
                anzsco_code, anzsco_name = ANZSCO_MAJOR_GROUPS[anzsco_abbrev]

                # Skip subtotal columns
                if anzsco_name == "_TOTAL":
                    continue

                anzsic_code, anzsic_name = ANZSIC_DIVISIONS[anzsic_abbrev]

                # ABS applies random adjustment — tiny negatives are possible; clamp to 0
                try:
                    employed_count: int | None = (
                        max(0, int(raw_value)) if raw_value else None
                    )
                except (ValueError, TypeError):
                    employed_count = None

                rows.append(
                    {
                        "geography_code": geography_code,
                        "anzsic_division_code": anzsic_code,
                        "anzsic_division_abbrev": anzsic_abbrev,
                        "anzsic_division_name": anzsic_name,
                        "anzsco_major_group": anzsco_code,
                        "anzsco_major_group_abbrev": anzsco_abbrev,
                        "anzsco_major_group_name": anzsco_name,
                        "employed_count": employed_count,
                        "census_year": 2021,
                        "source_table": "W12A",
                    }
                )

    return rows


async def ingest(csv_path: Path, dry_run: bool = False) -> int:
    """Load W12A data into abs_census_wpp. Returns row count processed."""
    if not csv_path.exists():
        raise FileNotFoundError(f"W12A CSV not found: {csv_path}")

    integrity_hash = compute_file_hash(str(csv_path))
    logger.info("W12A SHA-256: %s", integrity_hash)

    rows = parse_w12a(csv_path)
    logger.info("Parsed %d cells from W12A", len(rows))

    if dry_run:
        logger.info("Dry run — no DB writes. Sample rows:")
        for r in rows[:5]:
            logger.info("  %s", r)
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
                    text("SELECT COUNT(*) FROM abs_census_wpp WHERE census_year = 2021")
                )
            ).scalar()

            if existing_count and existing_count > 0:
                existing_hash = (
                    await session.execute(
                        text(
                            "SELECT integrity_hash FROM abs_census_wpp "
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

                logger.info(
                    "Source file changed — replacing %d existing rows", existing_count
                )
                await session.execute(
                    text("DELETE FROM abs_census_wpp WHERE census_year = 2021")
                )

            await session.execute(
                text(
                    """
                    INSERT INTO abs_census_wpp (
                        geography_code, anzsic_division_code, anzsic_division_abbrev,
                        anzsic_division_name, anzsco_major_group, anzsco_major_group_abbrev,
                        anzsco_major_group_name, employed_count, census_year, source_table,
                        integrity_hash
                    ) VALUES (
                        :geography_code, :anzsic_division_code, :anzsic_division_abbrev,
                        :anzsic_division_name, :anzsco_major_group, :anzsco_major_group_abbrev,
                        :anzsco_major_group_name, :employed_count, :census_year, :source_table,
                        :integrity_hash
                    )
                    """
                ),
                rows,
            )
            await session.commit()

            final_count = (
                await session.execute(
                    text("SELECT COUNT(*) FROM abs_census_wpp WHERE census_year = 2021")
                )
            ).scalar()
            logger.info("abs_census_wpp now contains %d rows", final_count)

    finally:
        await engine.dispose()

    return len(rows)


async def main() -> None:
    default_path = (
        Path(__file__).resolve().parents[4]
        / "Data"
        / "ABS-2021-Census"
        / "2021 Census WPP All Geographies for AUS"
        / "AUS"
        / "2021Census_W12A_AUS_POW_AUS.csv"
    )

    parser = argparse.ArgumentParser(description="Ingest ABS 2021 Census WPP W12A")
    parser.add_argument(
        "--file",
        type=Path,
        default=default_path,
        help="Path to 2021Census_W12A_AUS_POW_AUS.csv",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and log without writing to DB",
    )
    args = parser.parse_args()

    count = await ingest(args.file, dry_run=args.dry_run)
    logger.info("Done — %d rows processed", count)


if __name__ == "__main__":
    asyncio.run(main())
