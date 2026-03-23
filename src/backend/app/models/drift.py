"""Task drift metrics — FR-8.2 drift calculation and FR-8.3 classification.

Computed from AEI temporal snapshots via linear regression of task_pct
over model eras. Each row = one O*NET task with its velocity, classification,
and temporal metadata.
"""

from datetime import date

from sqlalchemy import Date, Float, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TaskDriftMetric(Base):
    """Per-task drift velocity and classification.

    velocity: slope from linregress of task_pct over time (snapshot_date as ordinal).
              Positive = increasing AI usage (departing trajectory).
              Negative = decreasing AI usage.
              NULL = insufficient data (<2 snapshots).

    classification: assigned by FR-8.3 based on velocity + importance + coverage.
        'departing'       — positive velocity, high task_pct
        'enduring'        — low/stable velocity, high O*NET importance
        'emerging'        — task appears in onet_emerging_tasks
        'below_threshold' — 40-50% task_pct with positive velocity (highest priority signal)
        NULL              — not yet classified or insufficient data
    """

    __tablename__ = "task_drift_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_text: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    first_seen_date: Mapped[date | None] = mapped_column(Date)
    latest_date: Mapped[date | None] = mapped_column(Date)
    snapshot_count: Mapped[int | None] = mapped_column(Integer)
    velocity: Mapped[float | None] = mapped_column(Float)
    r_squared: Mapped[float | None] = mapped_column(Float)
    p_value: Mapped[float | None] = mapped_column(Float)
    classification: Mapped[str | None] = mapped_column(Text)
    latest_task_pct: Mapped[float | None] = mapped_column(Float)
    peak_task_pct: Mapped[float | None] = mapped_column(Float)
    mean_task_pct: Mapped[float | None] = mapped_column(Float)
    platform: Mapped[str] = mapped_column(Text, nullable=False, server_default="claude_ai")

    __table_args__ = (
        Index("ix_task_drift_metrics_velocity", "velocity"),
        Index("ix_task_drift_metrics_classification", "classification"),
        Index("ix_task_drift_metrics_latest_task_pct", "latest_task_pct"),
    )
