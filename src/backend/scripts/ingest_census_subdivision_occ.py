"""Ingest ABS Census 2021 TableBuilder: ANZSIC Subdivision × ANZSCO Major Group.

Parses the "Total" wafer from a Census TableBuilder export of:
  INDP 2-digit × OCCP 1-digit × LFSP (Employed)

This fills the critical data gap: which occupations dominate each ANZSIC
subdivision. Enables subdivision-weighted occupation profiles for AU companies.

Source: ABS Census 2021, TableBuilder, CC-BY 4.0
Usage: python -m scripts.ingest_census_subdivision_occ <path-to-csv>
"""

import asyncio
import csv
import io
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Bootstrap
_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ANZSIC Division mapping: subdivision name prefix → division letter.
# TableBuilder uses "nfd" (not further defined) rows at division level.
# We map based on the ABS ANZSIC 2006 structure.
DIVISION_MAP: dict[str, str] = {
    "Agriculture, Forestry and Fishing": "A",
    "Agriculture": "A",
    "Aquaculture": "A",
    "Forestry and Logging": "A",
    "Fishing, Hunting and Trapping": "A",
    "Agriculture, Forestry and Fishing Support Services": "A",
    "Mining": "B",
    "Coal Mining": "B",
    "Oil and Gas Extraction": "B",
    "Metal Ore Mining": "B",
    "Non-Metallic Mineral Mining and Quarrying": "B",
    "Exploration and Other Mining Support Services": "B",
    "Manufacturing": "C",
    "Food Product Manufacturing": "C",
    "Beverage and Tobacco Product Manufacturing": "C",
    "Textile, Leather, Clothing and Footwear Manufacturing": "C",
    "Wood Product Manufacturing": "C",
    "Pulp, Paper and Converted Paper Product Manufacturing": "C",
    "Printing (including the Reproduction of Recorded Media)": "C",
    "Petroleum and Coal Product Manufacturing": "C",
    "Basic Chemical and Chemical Product Manufacturing": "C",
    "Polymer Product and Rubber Product Manufacturing": "C",
    "Non-Metallic Mineral Product Manufacturing": "C",
    "Primary Metal and Metal Product Manufacturing": "C",
    "Fabricated Metal Product Manufacturing": "C",
    "Transport Equipment Manufacturing": "C",
    "Machinery and Equipment Manufacturing": "C",
    "Furniture and Other Manufacturing": "C",
    "Electricity, Gas, Water and Waste Services": "D",
    "Electricity Supply": "D",
    "Gas Supply": "D",
    "Water Supply, Sewerage and Drainage Services": "D",
    "Waste Collection, Treatment and Disposal Services": "D",
    "Construction": "E",
    "Building Construction": "E",
    "Heavy and Civil Engineering Construction": "E",
    "Construction Services": "E",
    "Wholesale Trade": "F",
    "Basic Material Wholesaling": "F",
    "Machinery and Equipment Wholesaling": "F",
    "Motor Vehicle and Motor Vehicle Parts Wholesaling": "F",
    "Grocery, Liquor and Tobacco Product Wholesaling": "F",
    "Other Goods Wholesaling": "F",
    "Commission-Based Wholesaling": "F",
    "Retail Trade": "G",
    "Motor Vehicle and Motor Vehicle Parts Retailing": "G",
    "Fuel Retailing": "G",
    "Food Retailing": "G",
    "Other Store-Based Retailing": "G",
    "Non-Store Retailing and Retail Commission-Based Buying and/or Selling": "G",
    "Accommodation and Food Services": "H",
    "Accommodation": "H",
    "Food and Beverage Services": "H",
    "Transport, Postal and Warehousing": "I",
    "Road Transport": "I",
    "Rail Transport": "I",
    "Water Transport": "I",
    "Air and Space Transport": "I",
    "Other Transport": "I",
    "Postal and Courier Pick-up and Delivery Services": "I",
    "Transport Support Services": "I",
    "Warehousing and Storage Services": "I",
    "Information Media and Telecommunications": "J",
    "Publishing (except Internet and Music Publishing)": "J",
    "Motion Picture and Sound Recording Activities": "J",
    "Broadcasting (except Internet)": "J",
    "Internet Publishing and Broadcasting": "J",
    "Telecommunications Services": "J",
    "Internet Service Providers, Web Search Portals and Data Processing Services": "J",
    "Library and Other Information Services": "J",
    "Financial and Insurance Services": "K",
    "Finance": "K",
    "Insurance and Superannuation Funds": "K",
    "Auxiliary Finance and Insurance Services": "K",
    "Rental, Hiring and Real Estate Services": "L",
    "Rental and Hiring Services (except Real Estate)": "L",
    "Property Operators and Real Estate Services": "L",
    "Professional, Scientific and Technical Services": "M",
    "Professional, Scientific and Technical Services (except Computer System Design and Related Services)": "M",
    "Computer System Design and Related Services": "M",
    "Administrative and Support Services": "N",
    "Administrative Services": "N",
    "Building Cleaning, Pest Control and Other Support Services": "N",
    "Public Administration and Safety": "O",
    "Public Administration": "O",
    "Defence": "O",
    "Public Order, Safety and Regulatory Services": "O",
    "Education and Training": "P",
    "Preschool and School Education": "P",
    "Tertiary Education": "P",
    "Adult, Community and Other Education": "P",
    "Health Care and Social Assistance": "Q",
    "Hospitals": "Q",
    "Medical and Other Health Care Services": "Q",
    "Residential Care Services": "Q",
    "Social Assistance Services": "Q",
    "Arts and Recreation Services": "R",
    "Heritage Activities": "R",
    "Creative and Performing Arts Activities": "R",
    "Sports and Recreation Activities": "R",
    "Gambling Activities": "R",
    "Other Services": "S",
    "Repair and Maintenance": "S",
    "Personal and Other Services": "S",
    "Private Households Employing Staff and Undifferentiated Goods"
    " and Service-Producing Activities of Households for Own Use": "S",
}

# ANZSCO major group names (1-digit)
ANZSCO_NAMES = [
    "Managers",
    "Professionals",
    "Technicians and Trades Workers",
    "Community and Personal Service Workers",
    "Clerical and Administrative Workers",
    "Sales Workers",
    "Machinery Operators and Drivers",
    "Labourers",
]

# Skip rows
SKIP_NAMES = {"Inadequately described", "Not stated", "Not applicable", "Total"}


def parse_tablebuilder_csv(path: Path) -> list[dict]:
    """Parse the 'Total' wafer from a TableBuilder INDP×OCCP export."""
    raw = path.read_text(encoding="utf-8-sig")
    lines = raw.splitlines()

    # Find the "Total" wafer section (last data block)
    total_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith('" Total"') or line.strip() == '" Total"':
            total_start = i
            break

    if total_start is None:
        log.error("Could not find ' Total' wafer in CSV")
        sys.exit(1)

    log.info(f"Found 'Total' wafer at line {total_start + 1}")

    # Skip header rows after wafer label
    # Line total_start: " Total"
    # Line total_start+1: column headers
    # Line total_start+2: "2-digit level INDP..."
    # Line total_start+3+: data rows
    data_start = total_start + 3

    rows = []
    for line in lines[data_start:]:
        line = line.strip()
        if not line or line.startswith('"Data source') or line.startswith('"INFO'):
            break
        if line.startswith('"Copyright') or line.startswith('"ABS data'):
            break

        # Parse CSV-ish line: "Name",val1,val2,...,total,
        # Use csv reader for proper quote handling
        reader = csv.reader(io.StringIO(line))
        parts = next(reader)
        # Remove trailing empty strings from trailing commas
        parts = [p.strip() for p in parts if p.strip() != ""]

        if len(parts) < 9:
            continue

        indp_name = parts[0].strip().rstrip(", nfd")
        # Check if this is an nfd row — keep it but mark it
        is_nfd = parts[0].strip().endswith(", nfd")

        if indp_name in SKIP_NAMES:
            continue

        # Look up division code
        # Try exact match first, then nfd variant
        lookup_name = parts[0].strip()
        if lookup_name.endswith(", nfd"):
            lookup_name = lookup_name[:-5]  # Remove ", nfd"
        div_code = DIVISION_MAP.get(lookup_name)
        if div_code is None:
            # Try original name
            div_code = DIVISION_MAP.get(parts[0].strip())
        if div_code is None:
            log.warning(f"No division mapping for: {parts[0].strip()}")
            continue

        # Columns 1-8 are ANZSCO major groups 1-8
        for mg_idx in range(8):
            count_str = parts[1 + mg_idx] if (1 + mg_idx) < len(parts) else "0"
            try:
                count = int(count_str)
            except ValueError:
                count = 0

            if count > 0:
                rows.append({
                    "indp_name": parts[0].strip(),
                    "anzsic_division_code": div_code,
                    "anzsco_major_group": mg_idx + 1,
                    "anzsco_major_group_name": ANZSCO_NAMES[mg_idx],
                    "employed_count": count,
                    "is_nfd": is_nfd,
                })

    return rows


async def ingest(path: Path) -> None:
    """Parse CSV and insert into abs_census_subdivision_occ."""
    from app.utils.hashing import compute_file_hash
    from app.core.config import settings

    rows = parse_tablebuilder_csv(path)
    log.info(f"Parsed {len(rows)} subdivision × occupation cells")

    file_hash = compute_file_hash(path)

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if already loaded with same hash
        existing = await session.execute(
            text("SELECT integrity_hash FROM abs_census_subdivision_occ LIMIT 1")
        )
        row = existing.fetchone()
        if row and row[0] == file_hash:
            log.info("Data already loaded with same hash — skipping")
            return

        # Clear and reload
        await session.execute(text("DELETE FROM abs_census_subdivision_occ"))

        # Batch insert
        for r in rows:
            await session.execute(
                text("""
                    INSERT INTO abs_census_subdivision_occ
                        (indp_name, anzsic_division_code, anzsco_major_group,
                         anzsco_major_group_name, employed_count, census_year,
                         integrity_hash)
                    VALUES (:indp_name, :div, :mg, :mg_name, :count, 2021, :hash)
                """),
                {
                    "indp_name": r["indp_name"],
                    "div": r["anzsic_division_code"],
                    "mg": r["anzsco_major_group"],
                    "mg_name": r["anzsco_major_group_name"],
                    "count": r["employed_count"],
                    "hash": file_hash,
                },
            )

        await session.commit()
        log.info(f"Inserted {len(rows)} rows into abs_census_subdivision_occ")

        # Summary by division
        summary = await session.execute(text("""
            SELECT anzsic_division_code, count(*), sum(employed_count)
            FROM abs_census_subdivision_occ
            GROUP BY anzsic_division_code
            ORDER BY anzsic_division_code
        """))
        for div, cnt, emp in summary.fetchall():
            log.info(f"  {div}: {cnt} cells, {emp:,} employed")

    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.ingest_census_subdivision_occ <path-to-csv>")
        sys.exit(1)
    asyncio.run(ingest(Path(sys.argv[1])))
