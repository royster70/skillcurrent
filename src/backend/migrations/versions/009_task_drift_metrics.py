"""FR-8.2 Task drift metrics — velocity and classification per task

Revision ID: 009
Revises: 008
Create Date: 2026-03-23

Stores per-task drift velocity computed via linear regression of task_pct
over AEI temporal snapshots, plus FR-8.3 classification.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_drift_metrics",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_text", sa.Text(), nullable=False, unique=True),
        sa.Column("first_seen_date", sa.Date(), nullable=True),
        sa.Column("latest_date", sa.Date(), nullable=True),
        sa.Column("snapshot_count", sa.Integer(), nullable=True),
        sa.Column("velocity", sa.Float(), nullable=True),
        sa.Column("r_squared", sa.Float(), nullable=True),
        sa.Column("p_value", sa.Float(), nullable=True),
        sa.Column("classification", sa.Text(), nullable=True),
        sa.Column("latest_task_pct", sa.Float(), nullable=True),
        sa.Column("peak_task_pct", sa.Float(), nullable=True),
        sa.Column("mean_task_pct", sa.Float(), nullable=True),
        sa.Column("platform", sa.Text(), nullable=False, server_default="claude_ai"),
    )
    op.create_index("ix_task_drift_metrics_velocity", "task_drift_metrics", ["velocity"])
    op.create_index(
        "ix_task_drift_metrics_classification", "task_drift_metrics", ["classification"]
    )
    op.create_index(
        "ix_task_drift_metrics_latest_task_pct", "task_drift_metrics", ["latest_task_pct"]
    )


def downgrade() -> None:
    op.drop_table("task_drift_metrics")
