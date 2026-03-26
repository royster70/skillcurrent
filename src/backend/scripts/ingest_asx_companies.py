"""Ingest ASX listed companies with GICS → ANZSIC → NAICS concordance.

Downloads the ASX listed companies CSV and maps each company's GICS
industry group to ANZSIC division(s) and NAICS sector(s) via hardcoded
concordance tables.

Data source:
    https://www.asx.com.au/asx/research/ASXListedCompanies.csv
    Free, no API key. Updated regularly by ASX.

Usage:
    python -m scripts.ingest_asx_companies
"""

import asyncio
import csv
import io
import sys
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings  # noqa: E402

ASX_CSV_URL = "https://www.asx.com.au/asx/research/ASXListedCompanies.csv"

# ── GICS Industry Group → ANZSIC Division concordance ──
#
# GICS has 24 standard industry groups. ASX CSV uses these group names.
# Some map to multiple ANZSIC divisions (e.g. "Capital Goods" spans
# Manufacturing + Construction).
#
# Sources:
#   GICS structure: https://www.msci.com/our-solutions/indexes/gics
#   ANZSIC 2006: https://www.abs.gov.au/statistics/classifications/anzsic

GICS_TO_ANZSIC: dict[str, list[str]] = {
    # Energy & Resources
    "Energy": ["B"],                                          # Mining (oil/gas extraction)
    "Materials": ["B", "C"],                                  # Mining + Manufacturing
    "Utilities": ["D"],                                       # Electricity, Gas, Water

    # Industrials
    "Capital Goods": ["C", "E"],                              # Manufacturing + Construction
    "Commercial & Professional Services": ["N"],              # Administrative Services
    "Transportation": ["I"],                                  # Transport, Postal

    # Consumer
    "Automobiles & Components": ["C"],                        # Manufacturing
    "Consumer Durables & Apparel": ["C"],                     # Manufacturing
    "Consumer Services": ["H"],                               # Accommodation & Food Services
    "Consumer Discretionary Distribution & Retail": ["G"],    # Retail Trade
    "Consumer Staples Distribution & Retail": ["G"],          # Retail Trade
    "Food": ["C"],                                            # Manufacturing (food processing)
    "Food, Beverage & Tobacco": ["C"],                        # Manufacturing
    "Household & Personal Products": ["C"],                   # Manufacturing

    # Financials
    "Banks": ["K"],                                           # Financial & Insurance
    "Financial Services": ["K"],                              # Financial & Insurance
    "Insurance": ["K"],                                       # Financial & Insurance

    # Real Estate
    "Equity Real Estate Investment Trusts (REITs)": ["L"],    # Rental, Hiring, Real Estate
    "Real Estate Management & Development": ["L"],            # Rental, Hiring, Real Estate

    # Technology & Comms
    "Software & Services": ["J"],                             # Information Media & Telecom
    "Technology Hardware & Equipment": ["C", "J"],            # Manufacturing + Info
    "Semiconductors & Semiconductor Equipment": ["C"],        # Manufacturing
    "Telecommunication Services": ["J"],                      # Information Media & Telecom
    "Media & Entertainment": ["J", "R"],                      # Info Media + Arts/Recreation

    # Health Care
    "Health Care Equipment & Services": ["Q"],                # Health Care
    "Pharmaceuticals": ["C", "Q"],                            # Manufacturing + Health
    "Pharmaceuticals, Biotechnology & Life Sciences": ["C", "Q"],
}

# Reverse mapping: ANZSIC → NAICS (from industry_crosswalk table, queried at runtime)
# Fallback hardcoded for offline use
ANZSIC_TO_NAICS_FALLBACK: dict[str, list[str]] = {
    "A": ["11"], "B": ["21"], "C": ["31-33"], "D": ["22"], "E": ["23"],
    "F": ["42"], "G": ["44-45"], "H": ["72"], "I": ["48-49"], "J": ["51"],
    "K": ["52"], "L": ["53"], "M": ["54"], "N": ["56"], "O": ["99"],
    "P": ["61"], "Q": ["62"], "R": ["71"], "S": ["81"],
}


async def main() -> None:
    engine = create_async_engine(settings.database_url)

    # Download ASX CSV
    print(f"Downloading ASX listed companies from {ASX_CSV_URL}...")
    async with httpx.AsyncClient() as client:
        resp = await client.get(ASX_CSV_URL, follow_redirects=True)
        resp.raise_for_status()

    # Parse CSV (skip first 2 header lines)
    lines = resp.text.strip().split("\n")
    # First line is date header, second line is empty or column headers
    # Find the actual header row with "Company name"
    header_idx = 0
    for i, line in enumerate(lines):
        if "Company name" in line or "GICS industry group" in line:
            header_idx = i
            break

    reader = csv.DictReader(lines[header_idx:])
    companies = []
    skipped_gics = set()

    for row in reader:
        name = row.get("Company name", "").strip().strip('"')
        asx_code = row.get("ASX code", "").strip().strip('"')
        gics = row.get("GICS industry group", "").strip().strip('"')

        if not name or not asx_code:
            continue

        # Map GICS → ANZSIC
        anzsic_codes = GICS_TO_ANZSIC.get(gics, [])
        if not anzsic_codes and gics not in ("Not Applic", "Class Pend", "", "GICS industry group"):
            skipped_gics.add(gics)

        # Map ANZSIC → NAICS (fallback)
        naics_codes = []
        for ac in anzsic_codes:
            naics_codes.extend(ANZSIC_TO_NAICS_FALLBACK.get(ac, []))
        naics_codes = list(dict.fromkeys(naics_codes))  # deduplicate preserving order

        companies.append({
            "company_name": name,
            "asx_code": asx_code,
            "gics_group": gics if gics not in ("Not Applic", "Class Pend", "") else None,
            "anzsic_codes": anzsic_codes or ["Z"],  # Z = unclassified
            "naics_codes": naics_codes or [],
        })

    if skipped_gics:
        print(f"  Warning: Unknown GICS groups (no ANZSIC mapping): {skipped_gics}")

    print(f"  Parsed {len(companies)} companies")

    # Create table and insert
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS asx_company_sectors (
                id SERIAL PRIMARY KEY,
                company_name TEXT NOT NULL,
                asx_code TEXT NOT NULL UNIQUE,
                gics_group TEXT,
                anzsic_codes TEXT[] NOT NULL DEFAULT '{}',
                naics_codes TEXT[] DEFAULT '{}',
                ingested_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))

        # Create pg_trgm index for fuzzy search
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_asx_company_name_trgm
            ON asx_company_sectors USING gin (company_name gin_trgm_ops)
        """))

        # Clear and reload
        await conn.execute(text("DELETE FROM asx_company_sectors"))

        for c in companies:
            await conn.execute(text("""
                INSERT INTO asx_company_sectors (company_name, asx_code, gics_group, anzsic_codes, naics_codes)
                VALUES (:name, :code, :gics, :anzsic, :naics)
                ON CONFLICT (asx_code) DO UPDATE SET
                    company_name = EXCLUDED.company_name,
                    gics_group = EXCLUDED.gics_group,
                    anzsic_codes = EXCLUDED.anzsic_codes,
                    naics_codes = EXCLUDED.naics_codes,
                    ingested_at = NOW()
            """), {
                "name": c["company_name"],
                "code": c["asx_code"],
                "gics": c["gics_group"],
                "anzsic": c["anzsic_codes"],
                "naics": c["naics_codes"],
            })

    # Also create the LLM classification cache table
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS company_classifications (
                id SERIAL PRIMARY KEY,
                company_name_lower TEXT NOT NULL,
                region VARCHAR(2) NOT NULL DEFAULT 'AU',
                sector_codes TEXT[] NOT NULL DEFAULT '{}',
                sector_names TEXT[] DEFAULT '{}',
                confidence FLOAT,
                source TEXT DEFAULT 'llm',
                classified_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (company_name_lower, region)
            )
        """))

    await engine.dispose()

    # Summary
    classified = sum(1 for c in companies if c["anzsic_codes"] != ["Z"])
    print(f"\nDone: {len(companies)} companies loaded")
    print(f"  Classified (GICS mapped): {classified}")
    print(f"  Unclassified: {len(companies) - classified}")
    print(f"  Unique GICS groups: {len(set(c['gics_group'] for c in companies if c['gics_group']))}")


if __name__ == "__main__":
    asyncio.run(main())
