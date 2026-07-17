"""Temporal snapshot layer (ADR-012) — longitudinal history of derived readings.

The platform's core insight is directional: AI capability is a rising waterline,
and the product tracks *where it sits today and where it's heading*. That second
half needs history — but the derived "verdict" tables (task_drift_metrics,
industry_occupation_profiles, au_occupation_exposure, and the on-the-fly US
occupation zone) are all recomputed in place each pipeline run, so no prior
reading survives.

This module adds a SEPARATE, append-only history layer (mirroring the
aei_task_snapshots idiom) so nothing on the hot path changes:

  · SnapshotRun     — one row per capture: the temporal + provenance anchor
                      (as_of date, pipeline_run_id, the dataset versions that
                      produced it, an optional release label).
  · ExposureSnapshot — the compact verdicts diffed over time (β, zone, drift
                      velocity/classification) keyed by entity — NOT a full copy
                      of the wide derived tables (Rule 5: snapshot the verdicts
                      you diff, not everything).

Append-only: rows are only ever INSERTed, never UPDATEd or DELETEd, so a
"what changed since <release>" diff is a join between two SnapshotRuns.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Entity types a verdict row can describe. Kept as plain strings (not an enum)
# to match the codebase's data-keyed convention.
ENTITY_OCCUPATION = "occupation"
ENTITY_SECTOR_OCCUPATION = "sector_occupation"
ENTITY_TASK = "task"
ENTITY_AU_OCCUPATION = "au_occupation"


class SnapshotRun(Base):
    """One capture of the platform's derived readings — the temporal +
    provenance anchor every ExposureSnapshot row hangs off."""

    __tablename__ = "snapshot_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # The temporal axis. `captured_at` is the precise instant; `as_of_date` is
    # the day the reading represents (what deltas are labelled by).
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # Ties this capture to the pipeline run that produced the live tables it
    # read (matches transformation_log.pipeline_run_id — ADR-007). NULL for an
    # ad-hoc / manual capture outside a pipeline run.
    pipeline_run_id: Mapped[str | None] = mapped_column(Text)
    # Every run is captured (never lose history); a run can additionally be
    # marked a labelled release (e.g. "2026-Q3") so the UI can diff against the
    # last *release* rather than the last *run*.
    label: Mapped[str | None] = mapped_column(Text)
    is_release: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # The input dataset vintages that produced this reading ({name: version_key}),
    # so a historical reading is reproducible/attributable (ADR-002).
    input_versions: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    onet_version: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("ix_snapshot_runs_as_of_date", "as_of_date"),
        Index("ix_snapshot_runs_is_release", "is_release"),
        Index("ix_snapshot_runs_pipeline_run_id", "pipeline_run_id"),
    )


class ExposureSnapshot(Base):
    """A single verdict (β / zone / drift) for one entity at one snapshot.
    Append-only — the diff surface for "what changed over time"."""

    __tablename__ = "exposure_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_run_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("snapshot_runs.id", ondelete="CASCADE"), nullable=False
    )
    # 'occupation' | 'sector_occupation' | 'task' | 'au_occupation'
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    # soc | 'naics:soc' | task_text | osca_code
    entity_key: Mapped[str] = mapped_column(Text, nullable=False)
    # 'US' | 'AU' | 'GLOBAL' (tasks are platform-global) — NOT NULL so it can
    # sit in the natural key without NULL-distinctness surprises.
    region: Mapped[str] = mapped_column(Text, nullable=False, server_default="US")
    beta: Mapped[float | None] = mapped_column(Float)
    zone: Mapped[str | None] = mapped_column(Text)
    drift_velocity: Mapped[float | None] = mapped_column(Float)
    drift_classification: Mapped[str | None] = mapped_column(Text)
    # Entity-specific extras kept off the hot columns (AU divergence/us β/
    # coverage, sector weighting, etc.).
    extra: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "snapshot_run_id", "entity_type", "entity_key", "region", name="uq_exposure_snapshot"
        ),
        Index("ix_exposure_snapshots_run", "snapshot_run_id"),
        Index("ix_exposure_snapshots_entity", "entity_type", "entity_key"),
        Index("ix_exposure_snapshots_entity_region", "entity_type", "region"),
    )
