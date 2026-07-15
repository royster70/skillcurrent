"""Tests for the Rising Tide job-family bridge (drift task → SOC major group).

The frontend's "By job family" grouping reads `DriftTaskSummary.families`. This
locks in both the pure mapper and the live O*NET bridge that populates it.
"""

import pytest

from app.api.v1.drift import _families_by_task_text, _get_drift_tasks
from app.api.v1.soc_groups import MAJOR_GROUPS, families_for_soc_codes

# ── Pure mapper: families_for_soc_codes ──


class TestFamiliesForSocCodes:
    def test_none_and_empty_return_none(self):
        assert families_for_soc_codes(None) is None
        assert families_for_soc_codes([]) is None

    def test_two_digit_codes_map_to_names(self):
        assert families_for_soc_codes(["15"]) == ["Computer and Mathematical"]

    def test_full_soc_codes_map_via_prefix(self):
        # 8-digit O*NET-SOC and 6-digit BLS SOC both key on the first two chars.
        assert families_for_soc_codes(["15-1252.00"]) == ["Computer and Mathematical"]
        assert families_for_soc_codes(["29-1141"]) == ["Healthcare Practitioners and Technical"]

    def test_dedup_and_sorted(self):
        out = families_for_soc_codes(["43-0000", "15-1252.00", "15-2051.00"])
        assert out == ["Computer and Mathematical", "Office and Administrative Support"]

    def test_unknown_codes_drop_out(self):
        # "99" is not a real major group → nothing maps → None (not []).
        assert families_for_soc_codes(["99"]) is None

    def test_every_name_is_a_real_major_group(self):
        for code in MAJOR_GROUPS:
            out = families_for_soc_codes([code])
            assert out is not None and out[0] in MAJOR_GROUPS.values()


# ── Live O*NET bridge (real DB) ──


@pytest.mark.asyncio
async def test_families_by_task_text_keys_and_values(session):
    """The bridge returns lowercased keys mapped to valid major-group names."""
    # A task text known to exist in O*NET (software developer work).
    texts = ["write new programs or modify existing programs to meet requirements"]
    out = await _families_by_task_text(session, texts)
    # It may or may not match depending on exact O*NET wording, but if it does,
    # keys must be lowercased and values must be valid names.
    for key, fams in out.items():
        assert key == key.lower()
        assert fams  # non-empty
        assert all(f in MAJOR_GROUPS.values() for f in fams)


@pytest.mark.asyncio
async def test_families_empty_input_no_query(session):
    assert await _families_by_task_text(session, []) == {}


@pytest.mark.asyncio
async def test_departing_endpoint_populates_families(session):
    """The departing list carries `families`, some populated, all valid names."""
    resp = await _get_drift_tasks(session, "departing", min_snapshots=2, page=1, page_size=25)
    assert resp.tasks, "expected at least one departing task in the loaded data"

    # The field exists on every task (None allowed for unmatched tasks).
    for t in resp.tasks:
        assert hasattr(t, "families")
        if t.families is not None:
            assert all(f in MAJOR_GROUPS.values() for f in t.families)
            assert t.families == sorted(t.families)  # stable order

    # The bridge should populate at least some (loaded data is ~83% matchable).
    populated = [t for t in resp.tasks if t.families]
    assert populated, "no families populated — the drift→SOC bridge is broken"
