"""Tests for FR-8.2 drift calculation and FR-8.3 task classification."""

from datetime import date

import pytest

from app.services.drift_calculation import (
    _classify_task,
    _compute_velocity,
)

# ── FR-8.2: Velocity computation tests ──


class TestComputeVelocity:
    """Test linear regression velocity calculation."""

    def test_positive_slope(self):
        """Increasing values should produce positive velocity."""
        dates = [date(2025, 1, 1), date(2025, 4, 1), date(2025, 7, 1), date(2025, 10, 1)]
        values = [0.1, 0.2, 0.3, 0.4]
        result = _compute_velocity(dates, values)
        assert result["velocity"] is not None
        assert result["velocity"] > 0
        assert result["r_squared"] is not None
        assert result["r_squared"] > 0.99  # near-perfect linear
        assert result["p_value"] is not None

    def test_negative_slope(self):
        """Decreasing values should produce negative velocity."""
        dates = [date(2025, 1, 1), date(2025, 4, 1), date(2025, 7, 1), date(2025, 10, 1)]
        values = [0.4, 0.3, 0.2, 0.1]
        result = _compute_velocity(dates, values)
        assert result["velocity"] < 0

    def test_flat_slope(self):
        """Constant values should produce near-zero velocity."""
        dates = [date(2025, 1, 1), date(2025, 4, 1), date(2025, 7, 1), date(2025, 10, 1)]
        values = [0.5, 0.5, 0.5, 0.5]
        result = _compute_velocity(dates, values)
        assert result["velocity"] == 0.0

    def test_single_point_returns_none(self):
        """Single data point cannot compute slope."""
        result = _compute_velocity([date(2025, 1, 1)], [0.5])
        assert result["velocity"] is None
        assert result["r_squared"] is None
        assert result["p_value"] is None

    def test_two_points_exact(self):
        """Two points should produce exact slope (R²=1.0)."""
        dates = [date(2025, 1, 1), date(2025, 7, 1)]
        values = [0.1, 0.3]
        result = _compute_velocity(dates, values)
        assert result["velocity"] is not None
        assert result["velocity"] > 0
        assert result["r_squared"] == pytest.approx(1.0)

    def test_empty_returns_none(self):
        """No data returns None."""
        result = _compute_velocity([], [])
        assert result["velocity"] is None


# ── FR-8.3: Task classification tests ──


class TestClassifyTask:
    """Test task classification rules."""

    def test_emerging_overrides_all(self):
        """Emerging flag takes precedence over velocity-based rules."""
        result = _classify_task(
            velocity=0.01,  # would be departing
            latest_task_pct=0.5,
            mean_task_pct=0.4,
            is_emerging=True,
            avg_importance=4.0,
        )
        assert result == "emerging"

    def test_below_threshold_high_priority(self):
        """Tasks at 40-50% with positive velocity are below_threshold."""
        result = _classify_task(
            velocity=0.001,
            latest_task_pct=0.45,
            mean_task_pct=0.40,
            is_emerging=False,
            avg_importance=3.0,
        )
        assert result == "below_threshold"

    def test_departing_positive_velocity(self):
        """Positive velocity with meaningful usage = departing."""
        result = _classify_task(
            velocity=0.005,
            latest_task_pct=0.15,
            mean_task_pct=0.10,
            is_emerging=False,
            avg_importance=3.0,
        )
        assert result == "departing"

    def test_enduring_negative_velocity(self):
        """Negative velocity = enduring."""
        result = _classify_task(
            velocity=-0.002,
            latest_task_pct=0.10,
            mean_task_pct=0.12,
            is_emerging=False,
            avg_importance=4.0,
        )
        assert result == "enduring"

    def test_enduring_near_zero_velocity(self):
        """Near-zero velocity = enduring."""
        result = _classify_task(
            velocity=0.001,
            latest_task_pct=0.005,  # below departing min
            mean_task_pct=0.005,
            is_emerging=False,
            avg_importance=4.0,
        )
        assert result == "enduring"

    def test_none_velocity_returns_none(self):
        """No velocity data = unclassified."""
        result = _classify_task(
            velocity=None,
            latest_task_pct=0.1,
            mean_task_pct=0.1,
            is_emerging=False,
            avg_importance=3.0,
        )
        assert result is None

    def test_below_threshold_boundary_low(self):
        """Task at exactly 40% with positive velocity is below_threshold."""
        result = _classify_task(
            velocity=0.001,
            latest_task_pct=0.40,
            mean_task_pct=0.35,
            is_emerging=False,
            avg_importance=3.0,
        )
        assert result == "below_threshold"

    def test_below_threshold_boundary_high(self):
        """Task at exactly 50% with positive velocity is below_threshold."""
        result = _classify_task(
            velocity=0.001,
            latest_task_pct=0.50,
            mean_task_pct=0.45,
            is_emerging=False,
            avg_importance=3.0,
        )
        assert result == "below_threshold"

    def test_above_threshold_is_departing(self):
        """Task above 50% with positive velocity is departing, not below_threshold."""
        result = _classify_task(
            velocity=0.005,
            latest_task_pct=0.55,
            mean_task_pct=0.50,
            is_emerging=False,
            avg_importance=3.0,
        )
        assert result == "departing"
