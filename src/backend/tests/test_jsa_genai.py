"""Tests for the JSA "Our Gen AI Transition" AU-native exposure signal (FR-9.x).

Integration tests against the seeded DB. Verify the ingested shape, and that
the AU endpoint surfaces JSA as a SEPARATE reading from the bridge-derived
au_task_beta — never blended (CLAUDE.md invariant).
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.au_occupations import _au_jsa_native


async def _loaded(session: AsyncSession) -> bool:
    n = (await session.execute(text("SELECT count(*) FROM jsa_genai_exposure"))).scalar_one()
    return bool(n)


async def test_jsa_deduped_to_one_row_per_anzsco(session: AsyncSession):
    """714 source rows collapse to one per 4-digit ANZSCO code; the generic
    'All occupations' categorisation is dropped in favour of the specific group."""
    if not await _loaded(session):
        pytest.skip("jsa_genai_exposure not populated")
    total, distinct, four_digit, all_occ = (
        await session.execute(
            text(
                """
                SELECT count(*), count(DISTINCT anzsco_code),
                       count(*) FILTER (WHERE length(anzsco_code) = 4),
                       count(*) FILTER (WHERE matrix_group = 'All occupations')
                FROM jsa_genai_exposure
                """
            )
        )
    ).one()
    assert total == distinct  # one row per code
    assert four_digit == total  # all 4-digit unit groups
    assert all_occ == 0  # generic view dropped


async def test_augmentation_automation_in_unit_range(session: AsyncSession):
    """The two exposure scores are each on a 0–1 scale."""
    if not await _loaded(session):
        pytest.skip("jsa_genai_exposure not populated")
    bad = (
        await session.execute(
            text(
                """
                SELECT count(*) FROM jsa_genai_exposure
                WHERE (augmentation_score IS NOT NULL AND (augmentation_score < 0 OR augmentation_score > 1))
                   OR (automation_score IS NOT NULL AND (automation_score < 0 OR automation_score > 1))
                """
            )
        )
    ).scalar_one()
    assert bad == 0


async def test_endpoint_surfaces_jsa_as_separate_signal(session: AsyncSession):
    """_au_jsa_native returns the published AU reading for an occupation, and it
    is a DISTINCT signal from the bridge-derived exposure (never blended)."""
    if not await _loaded(session):
        pytest.skip("jsa_genai_exposure not populated")
    # Pick an OSCA code that has both a JSA reading and a bridge exposure.
    osca = (
        await session.execute(
            text(
                """
                SELECT m.osca_code
                FROM osca_anzsco_map m
                JOIN jsa_genai_exposure j ON j.anzsco_code = SUBSTRING(m.anzsco_code, 1, 4)
                JOIN au_occupation_exposure e ON e.osca_code = m.osca_code
                LIMIT 1
                """
            )
        )
    ).scalar()
    if osca is None:
        pytest.skip("no OSCA with both JSA and bridge exposure")

    jsa = await _au_jsa_native(session, osca)
    assert jsa is not None
    assert jsa.source_anzsco and len(jsa.source_anzsco) == 4
    assert "Jobs and Skills Australia" in jsa.source
    # JSA carries its OWN augmentation/automation scores — not a β, not sourced
    # from au_occupation_exposure.
    assert jsa.augmentation_score is not None
    assert 0.0 <= jsa.augmentation_score <= 1.0


async def test_signal_registered_and_redistributable(session: AsyncSession):
    """jsa_genai is marked loaded + redistribution_ok in the signal registry."""
    if not await _loaded(session):
        pytest.skip("jsa_genai_exposure not populated")
    row = (
        await session.execute(
            text(
                "SELECT status, redistribution_ok FROM signal_source_registry "
                "WHERE source_key = 'jsa_genai'"
            )
        )
    ).one()
    assert row[0] == "loaded"
    assert row[1] is True
