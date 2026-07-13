"""Ingest ANZSIC subdivision employment from JSA Industry Data Table 3.

Source: industry_data_-_november_2025_revised.xlsx — Table 3
        214 ANZSIC subdivisions across 19 divisions with employment headcounts.

Usage:
    python -m scripts.ingest_anzsic_subdivisions
    python -m scripts.ingest_anzsic_subdivisions --file /custom/path.xlsx
    python -m scripts.ingest_anzsic_subdivisions --dry-run
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.utils.hashing import compute_file_hash  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Division name → ANZSIC letter code
DIVISION_NAME_TO_CODE: dict[str, str] = {
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


def parse_table3(xlsx_path: Path) -> list[dict]:
    """Parse JSA Table 3 and return subdivision rows."""
    wb = openpyxl.load_workbook(str(xlsx_path), read_only=True)
    ws = wb["Table_3"]

    rows: list[dict] = []
    current_div_name: str | None = None

    for row in ws.iter_rows(min_row=8, max_row=500, values_only=True):
        div_cell = str(row[0]).strip() if row[0] else None
        sub_cell = str(row[1]).strip() if row[1] else None
        emp_cell = row[2]

        if not sub_cell:
            continue

        if div_cell and div_cell in DIVISION_NAME_TO_CODE:
            current_div_name = div_cell

        if current_div_name is None:
            logger.warning("Subdivision '%s' before any division header — skipping", sub_cell)
            continue

        div_code = DIVISION_NAME_TO_CODE[current_div_name]

        employment: int | None = None
        if emp_cell is not None:
            try:
                employment = max(0, int(float(emp_cell)))
            except (ValueError, TypeError):
                employment = None

        rows.append(
            {
                "anzsic_division_code": div_code,
                "anzsic_division_name": current_div_name,
                "subdivision_name": sub_cell,
                "employment": employment,
                "release_year": 2025,
            }
        )

    wb.close()
    return rows


async def ingest(xlsx_path: Path, dry_run: bool = False) -> int:
    """Load ANZSIC subdivision data. Returns row count."""
    if not xlsx_path.exists():
        raise FileNotFoundError(f"JSA industry data not found: {xlsx_path}")

    integrity_hash = compute_file_hash(str(xlsx_path))
    logger.info("JSA industry data SHA-256: %s", integrity_hash)

    rows = parse_table3(xlsx_path)
    logger.info("Parsed %d subdivisions from Table 3", len(rows))

    if dry_run:
        logger.info("Dry run — no DB writes. Sample rows:")
        for r in rows[:8]:
            logger.info(
                "  %s (%s): %s — %s",
                r["anzsic_division_code"],
                r["anzsic_division_name"][:30],
                r["subdivision_name"],
                f"{r['employment']:,}" if r["employment"] else "N/A",
            )
        return len(rows)

    for r in rows:
        r["integrity_hash"] = integrity_hash

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            existing_count = (
                await session.execute(
                    text("SELECT COUNT(*) FROM anzsic_subdivisions WHERE release_year = 2025")
                )
            ).scalar()

            if existing_count and existing_count > 0:
                existing_hash = (
                    await session.execute(
                        text(
                            "SELECT integrity_hash FROM anzsic_subdivisions "
                            "WHERE release_year = 2025 LIMIT 1"
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
                await session.execute(
                    text("DELETE FROM anzsic_subdivisions WHERE release_year = 2025")
                )

            await session.execute(
                text(
                    """
                    INSERT INTO anzsic_subdivisions (
                        anzsic_division_code, anzsic_division_name,
                        subdivision_name, employment, release_year, integrity_hash
                    ) VALUES (
                        :anzsic_division_code, :anzsic_division_name,
                        :subdivision_name, :employment, :release_year, :integrity_hash
                    )
                """
                ),
                rows,
            )
            await session.commit()

            final_count = (
                await session.execute(
                    text("SELECT COUNT(*) FROM anzsic_subdivisions WHERE release_year = 2025")
                )
            ).scalar()
            logger.info("anzsic_subdivisions now contains %d rows", final_count)

    finally:
        await engine.dispose()

    return len(rows)


async def run(file: str | Path | None = None, dry_run: bool = False) -> int:
    """Ingest ANZSIC subdivisions. Returns row count.

    Shared entry point for the CLI and the pipeline orchestrator.
    """
    xlsx_path = Path(file) if file else Path(settings.anzsic_industry_data_file)
    return await ingest(xlsx_path, dry_run=dry_run)


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest ANZSIC subdivisions from JSA Industry Data Table 3"
    )
    parser.add_argument("--file", type=Path, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    count = await run(args.file, dry_run=args.dry_run)
    logger.info("Done — %d rows processed", count)


if __name__ == "__main__":
    asyncio.run(main())
