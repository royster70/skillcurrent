"""Eloundou et al. (2024) occupation-level AI exposure scores

Revision ID: 005
Revises: 004
Create Date: 2026-03-23

Source: OpenAI supplementary data (occ_level.csv)
Paper: Eloundou, Manning, Mishkin, Rock (2024). Science 384:1306-1308.

Adds:
- eloundou_occ_scores: 923 occupation-level scores from both GPT-4 and human raters
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "eloundou_occ_scores",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("onet_soc", sa.Text(),
                  sa.ForeignKey("onet_occupations.onet_soc"), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        # GPT-4 rater (dv_ prefix in source): alpha=E1, beta=E2, gamma=E0
        sa.Column("dv_e1_alpha", sa.Float(), nullable=True),
        sa.Column("dv_e2_beta", sa.Float(), nullable=True),
        sa.Column("dv_e0_gamma", sa.Float(), nullable=True),
        sa.Column("dv_beta_derived", sa.Float(), nullable=True),
        # Human rater
        sa.Column("human_e1_alpha", sa.Float(), nullable=True),
        sa.Column("human_e2_beta", sa.Float(), nullable=True),
        sa.Column("human_e0_gamma", sa.Float(), nullable=True),
        sa.Column("human_beta_derived", sa.Float(), nullable=True),
        # Versioning
        sa.Column("dataset_version", sa.Text(), nullable=False),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_eloundou_occ_scores_onet_soc", "eloundou_occ_scores", ["onet_soc"])
    op.create_index("ix_eloundou_occ_scores_dv_beta", "eloundou_occ_scores", ["dv_beta_derived"])


def downgrade() -> None:
    op.drop_table("eloundou_occ_scores")
