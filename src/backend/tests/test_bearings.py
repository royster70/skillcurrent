"""Tests for the bearings endpoint — high ground + adjacency invariants.

Structural invariants over live data (not title-specific assertions, which
would couple tests to O*NET vintage): every high-ground skill is dry, every
adjacent role is meaningfully drier and bridged by enough shared activities,
and the ranking is by the transparent score.
"""

import pytest

from app.api.v1.bearings import (
    DRY_THRESHOLD,
    MIN_DRIER_BY,
    MIN_SHARED,
    _adjacent_roles,
    _high_ground,
)

BOOKKEEPER = "43-3031.00"  # deep role (β ~1.0) — adjacency should be rich
CASHIER = "41-2011.00"  # already-dry role (β ~0.24) — adjacency thin/low-score


@pytest.mark.asyncio
async def test_high_ground_is_dry_and_ranked(session):
    skills = await _high_ground(session, BOOKKEEPER)
    assert skills, "a deep clerical role should still have dry activities"
    assert len(skills) <= 8
    for s in skills:
        assert s.beta < DRY_THRESHOLD
        assert s.dwa_title
    # Ranked by importance (descending, Nones last).
    weights = [s.importance_weight for s in skills if s.importance_weight is not None]
    assert weights == sorted(weights, reverse=True)


@pytest.mark.asyncio
async def test_adjacent_roles_are_drier_and_bridged(session):
    # Source β for Bookkeeper (from the live occ scores).
    from sqlalchemy import text

    r = await session.execute(
        text("SELECT dv_beta_derived FROM eloundou_occ_scores WHERE onet_soc = :s"),
        {"s": BOOKKEEPER},
    )
    src_beta = r.scalar()
    assert src_beta is not None

    roles = await _adjacent_roles(session, BOOKKEEPER, src_beta)
    assert roles, "a deep role should have drier neighbours"
    scores = [a.score for a in roles]
    assert scores == sorted(scores, reverse=True), "ranked by score desc"
    for a in roles:
        assert a.soc_code != BOOKKEEPER
        assert a.beta < src_beta - MIN_DRIER_BY
        assert a.drier_by > MIN_DRIER_BY
        assert a.shared_count >= MIN_SHARED
        assert 1 <= len(a.shared_titles) <= 3  # the bridge skills preview


@pytest.mark.asyncio
async def test_already_dry_role_has_little_to_gain(session):
    """An insulated role's adjacency scores are small — the UI reads this as
    'hold the high ground', not as a strong move signal."""
    from sqlalchemy import text

    r = await session.execute(
        text("SELECT dv_beta_derived FROM eloundou_occ_scores WHERE onet_soc = :s"),
        {"s": CASHIER},
    )
    src_beta = r.scalar()
    assert src_beta is not None and src_beta < DRY_THRESHOLD

    roles = await _adjacent_roles(session, CASHIER, src_beta)
    # There may be a few technically-drier roles, but the gain is bounded by
    # the source β itself — scores stay near zero relative to a deep role.
    for a in roles:
        # Can never gain more dryness than you lack (compare at the response's
        # own 4-dp rounding — drier_by is rounded, src_beta here is not).
        assert a.drier_by <= round(src_beta, 4)
        assert a.score < 0.1


@pytest.mark.asyncio
async def test_endpoint_shapes_and_404(session):
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        ok = await c.get(f"/api/v1/occupations/{BOOKKEEPER}/bearings")
        assert ok.status_code == 200
        body = ok.json()
        assert body["soc_code"] == BOOKKEEPER
        assert body["high_ground"] and body["adjacent"]

        missing = await c.get("/api/v1/occupations/99-9999.00/bearings")
        assert missing.status_code == 404
