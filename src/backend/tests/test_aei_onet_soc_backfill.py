"""Tests for the AEI snapshot onet_soc_codes bridge (migration 033 / ingest).

`aei_task_snapshots.onet_soc_codes` was 100% NULL in the loaded data, which
silently broke every `@> ARRAY[soc]` consumer (industry_profiles.py's four
lateral joins, and the original occupations.py drift query). These tests lock in
that `_populate_onet_soc_codes` materialises the array from O*NET's own task->SOC
map, case-insensitively, at the 6-digit grain the consumers key on.
"""

import pytest
from sqlalchemy import text

from app.services.aei_temporal_ingestion import _populate_onet_soc_codes


@pytest.mark.asyncio
async def test_populate_onet_soc_codes_bridges_task_text_to_6digit_soc(session):
    """A snapshot whose task_text matches an O*NET task gets 6-digit SOC codes."""
    # Anchor on a real O*NET task + its SOC so the bridge has something to match.
    row = (
        await session.execute(
            text(
                "SELECT task, onet_soc FROM onet_task_statements "
                "WHERE task IS NOT NULL AND onet_soc IS NOT NULL LIMIT 1"
            )
        )
    ).fetchone()
    assert row is not None, "onet_task_statements must be loaded for this test"
    task, onet_soc = row
    six_digit = onet_soc[:7]  # e.g. '15-1252.00' -> '15-1252'

    # Insert a snapshot whose task_text matches case-INSENSITIVELY (upper-cased),
    # proving the bridge lowercases both sides. Unique (task_text, date, platform).
    await session.execute(
        text(
            """
            INSERT INTO aei_task_snapshots
                (task_text, onet_soc_codes, snapshot_date, release_version, model_era, platform)
            VALUES (:tt, NULL, DATE '1999-01-01', 'test-033', 'test-era', 'test_backfill_033')
            """
        ),
        {"tt": task.upper()},
    )

    populated = await _populate_onet_soc_codes(session)
    assert populated >= 1

    got = (
        await session.execute(
            text(
                "SELECT onet_soc_codes FROM aei_task_snapshots "
                "WHERE platform = 'test_backfill_033'"
            )
        )
    ).scalar_one()

    assert got is not None, "the inserted snapshot should be populated"
    assert six_digit in got, "the matching task's 6-digit SOC must appear in the array"
    # Grain guard: every code is a 6-digit BLS SOC ('NN-NNNN'), never 8-digit.
    assert all(len(code) == 7 and code[2] == "-" for code in got)


@pytest.mark.asyncio
async def test_populate_onet_soc_codes_is_idempotent_on_populated_rows(session):
    """Rows that already carry codes are never overwritten (immutability guard)."""
    await session.execute(
        text(
            """
            INSERT INTO aei_task_snapshots
                (task_text, onet_soc_codes, snapshot_date, release_version, model_era, platform)
            VALUES ('sentinel task', ARRAY['99-9999'], DATE '1999-01-02',
                    'test-033', 'test-era', 'test_backfill_033b')
            """
        )
    )
    await _populate_onet_soc_codes(session)
    got = (
        await session.execute(
            text(
                "SELECT onet_soc_codes FROM aei_task_snapshots "
                "WHERE platform = 'test_backfill_033b'"
            )
        )
    ).scalar_one()
    assert got == ["99-9999"], "pre-populated codes must be left untouched"
