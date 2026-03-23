"""Tests that verify cross-dataset join paths work correctly.

These tests confirm that FK relationships and prefix-based joins
between O*NET, Eloundou, Microsoft, and AEI datasets produce
expected row counts and coverage levels.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def test_eloundou_occ_joins_to_onet(session: AsyncSession):
    """FK join between eloundou_occ_scores and onet_occupations works."""
    result = await session.execute(
        text("""
            SELECT COUNT(*) AS matched
            FROM eloundou_occ_scores e
            JOIN onet_occupations o ON e.onet_soc = o.onet_soc
        """)
    )
    matched = result.scalar_one()
    assert matched > 0, "No rows matched between eloundou_occ_scores and onet_occupations"

    # Check total eloundou rows to compute coverage
    total_result = await session.execute(
        text("SELECT COUNT(*) FROM eloundou_occ_scores")
    )
    total = total_result.scalar_one()
    assert matched == total, (
        f"Only {matched}/{total} eloundou_occ_scores rows join to onet_occupations"
    )


async def test_microsoft_soc_prefix_join(session: AsyncSession):
    """6-digit Microsoft SOC codes join to 8-digit O*NET codes via prefix.

    Expected coverage >= 900 O*NET occupations.
    """
    result = await session.execute(
        text("""
            SELECT COUNT(DISTINCT o.onet_soc) AS matched_occupations
            FROM ms_ai_applicability_scores m
            JOIN onet_occupations o ON o.onet_soc LIKE m.soc_code || '.%'
        """)
    )
    matched = result.scalar_one()
    assert matched >= 900, (
        f"Microsoft SOC prefix join covers {matched} O*NET occupations, expected >= 900"
    )


async def test_aei_soc_prefix_join(session: AsyncSession):
    """AEI job_exposure joins to O*NET occupations via SOC prefix match.

    aei_job_exposure uses 6-digit occ_code; O*NET uses 8-digit onet_soc.
    """
    result = await session.execute(
        text("""
            SELECT COUNT(DISTINCT o.onet_soc) AS matched
            FROM aei_job_exposure a
            JOIN onet_occupations o ON o.onet_soc LIKE a.occ_code || '%'
        """)
    )
    matched = result.scalar_one()
    assert matched > 0, "No AEI job_exposure records join to O*NET occupations"


async def test_iwa_to_dwa_join(session: AsyncSession):
    """ms_ai_iwa_metrics.iwa_code joins to onet_dwa_references.iwa_id.

    Expected: all 332 IWA codes match.
    """
    result = await session.execute(
        text("""
            SELECT COUNT(DISTINCT m.iwa_code) AS matched
            FROM ms_ai_iwa_metrics m
            JOIN onet_dwa_references d ON m.iwa_code = d.iwa_id
        """)
    )
    matched = result.scalar_one()
    assert matched == 332, (
        f"Expected 332 IWA-to-DWA matches, got {matched}"
    )


async def test_three_tier_coverage(session: AsyncSession):
    """Occupations with all 3 scores (Eloundou + Microsoft + AEI) >= 850.

    This verifies that the three main data sources have substantial overlap
    at the occupation level.
    """
    result = await session.execute(
        text("""
            SELECT COUNT(DISTINCT o.onet_soc) AS three_tier_count
            FROM onet_occupations o
            JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
            JOIN ms_ai_applicability_scores m ON o.onet_soc LIKE m.soc_code || '%'
            JOIN aei_job_exposure a ON o.onet_soc LIKE a.occ_code || '%'
        """)
    )
    count = result.scalar_one()
    assert count >= 850, (
        f"Only {count} occupations have all 3 scores (Eloundou + Microsoft + AEI), expected >= 850"
    )
