"""Ingest ABS Census 2021 TableBuilder: ANZSIC × ANZSCO cross-tab.

Supports two Census TableBuilder export formats:
  1. Pivot format (2-digit INDP): wafer-based, columns are ANZSCO groups
  2. Long format (3-digit INDP): one row per LFSP × INDP × OCCP combo

Both fill the critical data gap: which occupations dominate each ANZSIC
subdivision/group. Enables subdivision-weighted occupation profiles.

Source: ABS Census 2021, TableBuilder, CC-BY 4.0
Usage:
  python -m scripts.ingest_census_subdivision_occ <path-to-csv>
  python -m scripts.ingest_census_subdivision_occ <path> --level 3
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

# ANZSCO name → major group number mapping (for long-format CSV)
ANZSCO_NAME_TO_MG: dict[str, int] = {
    "Managers": 1,
    "Professionals": 2,
    "Technicians and Trades Workers": 3,
    "Community and Personal Service Workers": 4,
    "Clerical and Administrative Workers": 5,
    "Sales Workers": 6,
    "Machinery Operators and Drivers": 7,
    "Labourers": 8,
}

# Division-level anchor names (for 3-digit long-format CSV).
# When we encounter these nfd rows, we know which division follows.
DIVISION_ANCHORS: dict[str, str] = {
    "Electricity, Gas, Water and Waste Services": "D",
    "Manufacturing": "C",
    "Retail Trade": "G",
    "Financial and Insurance Services": "K",
}


def parse_long_format_csv(path: Path) -> list[dict]:
    """Parse long-format Census CSV: one row per LFSP × INDP × OCCP.

    Filters to LFSP='Total' rows, valid ANZSCO major groups (1-8).
    Uses anchor detection for division codes: division-level nfd rows
    mark division boundaries, subsequent 3-digit group rows inherit
    that division code.

    Skips all nfd rows (division + subdivision residuals) — only keeps
    genuine 3-digit ANZSIC group rows.
    """
    raw = path.read_text(encoding="utf-8-sig")
    reader = csv.reader(io.StringIO(raw))

    current_division: str | None = None
    rows: list[dict] = []
    # Track rows dropped because no division anchor was in scope.
    # Silent drops here are exactly the "measurement is lying" failure mode
    # ADR-007 Phase 3 Rule 4 exists to prevent — count them and fail loud.
    orphaned: list[str] = []
    seen_anchors: set[str] = set()

    for parts in reader:
        # Skip header/metadata rows (fewer than 5 columns)
        if len(parts) < 5:
            continue

        # Column layout: Counting, LFSP, INDP, OCCP, Count
        counting = parts[0].strip()
        lfsp = parts[1].strip()
        indp_name = parts[2].strip()
        occp_name = parts[3].strip()
        count_str = parts[4].strip() if len(parts) > 4 else "0"

        # Only process "Person Records" data rows
        if counting != "Person Records":
            continue

        # Only use LFSP = "Total" (combines full-time + part-time + away)
        if lfsp != "Total":
            continue

        # Skip non-occupation rows
        if occp_name in SKIP_NAMES:
            continue

        # Map ANZSCO name → major group number
        mg = ANZSCO_NAME_TO_MG.get(occp_name)
        if mg is None:
            continue

        # Parse count
        try:
            count = int(count_str)
        except ValueError:
            count = 0

        if count <= 0:
            continue

        # Check if this is an nfd row (division or subdivision anchor)
        is_nfd = indp_name.endswith(", nfd")
        if is_nfd:
            base_name = indp_name[:-5]  # Strip ", nfd"
            # Check if this is a division-level anchor
            if base_name in DIVISION_ANCHORS:
                current_division = DIVISION_ANCHORS[base_name]
                seen_anchors.add(base_name)
                log.info(
                    f"Division anchor: '{base_name}' → {current_division}"
                )
            # Skip all nfd rows (division + subdivision residuals)
            continue

        # This is a genuine 3-digit ANZSIC group row
        if current_division is None:
            orphaned.append(indp_name)
            continue

        rows.append({
            "indp_name": indp_name,
            "anzsic_division_code": current_division,
            "anzsco_major_group": mg,
            "anzsco_major_group_name": occp_name,
            "employed_count": count,
            "is_nfd": False,
        })

    # Fail loud on silent data loss.
    # If any group row was dropped because no division anchor preceded it,
    # the CSV is either malformed or DIVISION_ANCHORS is missing entries.
    # Either way, the resulting dataset would be incomplete in a way that
    # the row count alone cannot detect — refuse to proceed.
    if orphaned:
        unique_orphans = sorted(set(orphaned))
        log.error(
            f"Dropped {len(orphaned)} rows ({len(unique_orphans)} unique INDPs) "
            f"with no division anchor in scope. "
            f"DIVISION_ANCHORS may need new entries, or the CSV row order "
            f"differs from expected (anchor-then-children)."
        )
        log.error(f"First 10 orphaned INDPs: {unique_orphans[:10]}")
        log.error(f"Anchors seen during parse: {sorted(seen_anchors)}")
        raise RuntimeError(
            f"parse_long_format_csv: {len(orphaned)} rows dropped without "
            f"a division anchor — refusing to load partial data. "
            f"See ADR-007 Phase 3 Rule 4 (no silent measurement gaps)."
        )

    log.info(
        f"parse_long_format_csv: {len(rows)} rows kept, "
        f"{len(seen_anchors)} division anchors matched: {sorted(seen_anchors)}"
    )
    return rows


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


async def ingest(path: Path, level: int = 2) -> None:
    """Parse CSV and insert into abs_census_subdivision_occ.

    Args:
        path: Path to the Census TableBuilder CSV export.
        level: INDP granularity level.
            2 = ANZSIC Subdivision (pivot format, all 19 divisions)
            3 = ANZSIC Group (long format, C/D/G/K divisions)
    """
    from app.utils.hashing import compute_file_hash
    from app.core.config import settings

    if level == 3:
        rows = parse_long_format_csv(path)
    else:
        rows = parse_tablebuilder_csv(path)
    log.info(f"Parsed {len(rows)} level-{level} cells")

    file_hash = compute_file_hash(path)

    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check if already loaded with same hash at this level
        existing = await session.execute(
            text(
                "SELECT integrity_hash "
                "FROM abs_census_subdivision_occ "
                "WHERE indp_level = :lvl LIMIT 1"
            ),
            {"lvl": level},
        )
        row = existing.fetchone()
        if row and row[0] == file_hash:
            log.info(f"Level-{level} data already loaded — skipping")
            return

        # Clear only rows at this level (preserve other levels)
        await session.execute(
            text(
                "DELETE FROM abs_census_subdivision_occ "
                "WHERE indp_level = :lvl"
            ),
            {"lvl": level},
        )

        # Batch insert
        for r in rows:
            await session.execute(
                text("""
                    INSERT INTO abs_census_subdivision_occ
                        (indp_name, anzsic_division_code, anzsco_major_group,
                         anzsco_major_group_name, employed_count, census_year,
                         integrity_hash, indp_level)
                    VALUES (
                        :indp_name, :div, :mg, :mg_name,
                        :count, 2021, :hash, :lvl
                    )
                """),
                {
                    "indp_name": r["indp_name"],
                    "div": r["anzsic_division_code"],
                    "mg": r["anzsco_major_group"],
                    "mg_name": r["anzsco_major_group_name"],
                    "count": r["employed_count"],
                    "hash": file_hash,
                    "lvl": level,
                },
            )

        await session.commit()
        log.info(
            f"Inserted {len(rows)} level-{level} rows "
            "into abs_census_subdivision_occ"
        )

        # Summary by division for this level
        summary = await session.execute(
            text("""
                SELECT anzsic_division_code, count(*),
                       sum(employed_count)
                FROM abs_census_subdivision_occ
                WHERE indp_level = :lvl
                GROUP BY anzsic_division_code
                ORDER BY anzsic_division_code
            """),
            {"lvl": level},
        )
        for div, cnt, emp in summary.fetchall():
            log.info(f"  {div}: {cnt} cells, {emp:,} employed")

        # Grand total across all levels
        total = await session.execute(
            text("SELECT count(*) FROM abs_census_subdivision_occ")
        )
        log.info(f"Total rows (all levels): {total.scalar()}")

    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python -m scripts.ingest_census_subdivision_occ "
            "<path-to-csv> [--level 2|3]"
        )
        sys.exit(1)

    level = 2
    if "--level" in sys.argv:
        idx = sys.argv.index("--level")
        if idx + 1 < len(sys.argv):
            level = int(sys.argv[idx + 1])

    asyncio.run(ingest(Path(sys.argv[1]), level=level))
