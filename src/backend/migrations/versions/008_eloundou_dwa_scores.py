"""Eloundou DWA-level derived scores table

Revision ID: 008
Revises: 007
Create Date: 2026-03-23

DWA-level scores derived from occupation-level Eloundou scores via
Strategy A: distribute occupation Beta across DWAs weighted by O*NET
task importance ratings.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "eloundou_dwa_scores",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("onet_soc", sa.Text(), nullable=False),
        sa.Column("dwa_id", sa.Text(), nullable=False),
        sa.Column("dwa_title", sa.Text(), nullable=True),
        # GPT-4 rater derived scores
        sa.Column("dv_e1_alpha", sa.Float(), nullable=True),
        sa.Column("dv_e2_beta", sa.Float(), nullable=True),
        sa.Column("dv_e0_gamma", sa.Float(), nullable=True),
        sa.Column("dv_beta_derived", sa.Float(), nullable=True),
        # Human rater derived scores
        sa.Column("human_e1_alpha", sa.Float(), nullable=True),
        sa.Column("human_e2_beta", sa.Float(), nullable=True),
        sa.Column("human_e0_gamma", sa.Float(), nullable=True),
        sa.Column("human_beta_derived", sa.Float(), nullable=True),
        # Weighting metadata
        sa.Column("importance_weight", sa.Float(), nullable=True),
        sa.Column("task_count", sa.Integer(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False, server_default="derived"),
        # Versioning
        sa.Column("dataset_version", sa.Text(), nullable=False),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_eloundou_dwa_scores_onet_soc", "eloundou_dwa_scores", ["onet_soc"])
    op.create_index("ix_eloundou_dwa_scores_dwa_id", "eloundou_dwa_scores", ["dwa_id"])
    op.create_index("ix_eloundou_dwa_scores_dv_beta", "eloundou_dwa_scores", ["dv_beta_derived"])


def downgrade() -> None:
    op.drop_table("eloundou_dwa_scores")
