"""Migration 034: temporal snapshot layer (ADR-012).

Two append-only tables that give the platform longitudinal memory of its own
derived readings, so "what changed since <release>" is answerable — the
derived verdict tables (task_drift_metrics, industry_occupation_profiles,
au_occupation_exposure, and the on-the-fly US occupation zone) are all
recomputed in place each pipeline run and keep no history.

  · snapshot_runs      — one row per capture: the temporal + provenance anchor
                         (as_of date, pipeline_run_id, input dataset versions,
                         optional release label).
  · exposure_snapshots — the compact per-entity verdicts diffed over time
                         (β, zone, drift velocity/classification). Append-only.

Separate from the live tables by design — nothing on the recompute hot path
changes (the live tables keep their clear-and-reload write paths and natural
keys). Mirrors the existing aei_task_snapshots append-only idiom.

Tier-1 reference data (public sources only — no org data, no privacy scope).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "snapshot_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("pipeline_run_id", sa.Text(), nullable=True),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("is_release", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("input_versions", postgresql.JSONB(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_snapshot_runs_as_of_date", "snapshot_runs", ["as_of_date"])
    op.create_index("ix_snapshot_runs_is_release", "snapshot_runs", ["is_release"])
    op.create_index("ix_snapshot_runs_pipeline_run_id", "snapshot_runs", ["pipeline_run_id"])

    op.create_table(
        "exposure_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("snapshot_run_id", sa.Integer(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_key", sa.Text(), nullable=False),
        sa.Column("region", sa.Text(), nullable=False, server_default="US"),
        sa.Column("beta", sa.Float(), nullable=True),
        sa.Column("zone", sa.Text(), nullable=True),
        sa.Column("drift_velocity", sa.Float(), nullable=True),
        sa.Column("drift_classification", sa.Text(), nullable=True),
        sa.Column("extra", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["snapshot_run_id"], ["snapshot_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "snapshot_run_id", "entity_type", "entity_key", "region", name="uq_exposure_snapshot"
        ),
    )
    op.create_index("ix_exposure_snapshots_run", "exposure_snapshots", ["snapshot_run_id"])
    op.create_index(
        "ix_exposure_snapshots_entity", "exposure_snapshots", ["entity_type", "entity_key"]
    )
    op.create_index(
        "ix_exposure_snapshots_entity_region", "exposure_snapshots", ["entity_type", "region"]
    )


def downgrade() -> None:
    op.drop_index("ix_exposure_snapshots_entity_region", table_name="exposure_snapshots")
    op.drop_index("ix_exposure_snapshots_entity", table_name="exposure_snapshots")
    op.drop_index("ix_exposure_snapshots_run", table_name="exposure_snapshots")
    op.drop_table("exposure_snapshots")
    op.drop_index("ix_snapshot_runs_pipeline_run_id", table_name="snapshot_runs")
    op.drop_index("ix_snapshot_runs_is_release", table_name="snapshot_runs")
    op.drop_index("ix_snapshot_runs_as_of_date", table_name="snapshot_runs")
    op.drop_table("snapshot_runs")
