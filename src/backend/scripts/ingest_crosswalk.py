"""Load NAICS ↔ ANZSIC industry crosswalk via ISIC Rev.4 bridge.

The crosswalk maps at the sector/division level:
  NAICS 2022 (20 sectors) → ISIC Rev.4 → ANZSIC 2006 (19 divisions)

Data sourced from:
  - Statistics Canada NAICS↔ISIC concordance
  - UN Statistics Division ANZSIC↔ISIC comparison
  - ABS ANZSIC 2006 Rev.2 classification structure

Usage:
    python -m scripts.ingest_crosswalk
"""

import asyncio
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings  # noqa: E402

# ── NAICS ↔ ANZSIC sector-level concordance ──
#
# Sources:
#   NAICS sectors: https://www.census.gov/naics/?58967?yeession=2022
#   ANZSIC divisions: https://www.abs.gov.au/statistics/classifications/anzsic
#   ISIC Rev.4 bridge: https://unstats.un.org/unsd/classifications/Econ/isic
#
# match_type:
#   exact  = 1:1 mapping (clear conceptual match)
#   partial = overlapping scope (some activities in both)
#   split  = one source maps to multiple targets (use weight)

CROSSWALK_DATA = [
    # (naics_code, naics_title, anzsic_code, anzsic_title, isic_bridge, match_type, weight)

    # Agriculture
    ("11", "Agriculture, Forestry, Fishing and Hunting", "A", "Agriculture, Forestry and Fishing", "A", "exact", 1.0),

    # Mining
    ("21", "Mining, Quarrying, and Oil and Gas Extraction", "B", "Mining", "B", "exact", 1.0),

    # Utilities
    ("22", "Utilities", "D", "Electricity, Gas, Water and Waste Services", "D+E", "exact", 1.0),

    # Construction
    ("23", "Construction", "E", "Construction", "F", "exact", 1.0),

    # Manufacturing — NAICS 31-33 maps to ANZSIC C
    ("31-33", "Manufacturing", "C", "Manufacturing", "C", "exact", 1.0),

    # Wholesale Trade
    ("42", "Wholesale Trade", "F", "Wholesale Trade", "G", "exact", 1.0),

    # Retail Trade — NAICS 44-45 maps to ANZSIC G
    ("44-45", "Retail Trade", "G", "Retail Trade", "G", "exact", 1.0),

    # Transportation — NAICS 48-49 maps to ANZSIC I
    ("48-49", "Transportation and Warehousing", "I", "Transport, Postal and Warehousing", "H+J", "exact", 1.0),

    # Information — splits between ANZSIC J (Info/Telecom) and partial S (Other)
    ("51", "Information", "J", "Information Media and Telecommunications", "J", "partial", 0.85),
    ("51", "Information", "S", "Other Services", "S", "partial", 0.15),

    # Finance and Insurance
    ("52", "Finance and Insurance", "K", "Financial and Insurance Services", "K", "exact", 1.0),

    # Real Estate
    ("53", "Real Estate and Rental and Leasing", "L", "Rental, Hiring and Real Estate Services", "L", "exact", 1.0),

    # Professional, Scientific, and Technical Services
    ("54", "Professional, Scientific, and Technical Services", "M", "Professional, Scientific and Technical Services", "M", "exact", 1.0),

    # Management of Companies — maps to parts of M (Professional) in ANZSIC
    ("55", "Management of Companies and Enterprises", "M", "Professional, Scientific and Technical Services", "M", "partial", 1.0),

    # Administrative and Support
    ("56", "Administrative and Support and Waste Management and Remediation Services", "N", "Administrative and Support Services", "N", "exact", 1.0),

    # Education
    ("61", "Educational Services", "P", "Education and Training", "P", "exact", 1.0),

    # Health Care
    ("62", "Health Care and Social Assistance", "Q", "Health Care and Social Assistance", "Q", "exact", 1.0),

    # Arts, Entertainment, and Recreation
    ("71", "Arts, Entertainment, and Recreation", "R", "Arts and Recreation Services", "R", "exact", 1.0),

    # Accommodation and Food Services
    ("72", "Accommodation and Food Services", "H", "Accommodation and Food Services", "I", "exact", 1.0),

    # Other Services
    ("81", "Other Services (except Public Administration)", "S", "Other Services", "S", "partial", 0.85),

    # Public Administration — ANZSIC O
    ("99", "Federal, State, and Local Government", "O", "Public Administration and Safety", "O", "exact", 1.0),
]


async def main() -> None:
    engine = create_async_engine(settings.database_url)

    async with engine.begin() as conn:
        # Clear existing crosswalk data
        await conn.execute(text("DELETE FROM industry_crosswalk"))

        # Insert crosswalk rows
        count = 0
        for (naics, naics_title, anzsic, anzsic_title, isic, match_type, weight) in CROSSWALK_DATA:
            await conn.execute(
                text("""
                    INSERT INTO industry_crosswalk
                        (source_system, source_code, target_system, target_code,
                         bridge_system, bridge_code, match_type, weight)
                    VALUES
                        ('NAICS_2022', :naics, 'ANZSIC_2006', :anzsic,
                         'ISIC_REV4', :isic, :match_type, :weight)
                    ON CONFLICT DO NOTHING
                """),
                {
                    "naics": naics,
                    "anzsic": anzsic,
                    "isic": isic,
                    "match_type": match_type,
                    "weight": weight,
                },
            )
            count += 1

        # Verify
        result = await conn.execute(text("SELECT COUNT(*) FROM industry_crosswalk"))
        total = result.scalar()
        print(f"Loaded {total} crosswalk mappings ({count} attempted)")

        # Show summary
        result = await conn.execute(text("""
            SELECT source_code, target_code, match_type, weight
            FROM industry_crosswalk
            ORDER BY source_code
        """))
        print(f"\n{'NAICS':<10} {'ANZSIC':<8} {'Type':<10} {'Weight'}")
        print("-" * 40)
        for row in result.fetchall():
            print(f"{row[0]:<10} {row[1]:<8} {row[2]:<10} {row[3]}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
