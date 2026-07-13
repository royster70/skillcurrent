"""Microsoft "Working with AI" tables — empirical AI applicability from Copilot usage

Revision ID: 004
Revises: 003
Create Date: 2026-03-23

Source: Tomlinson et al. (2025), CC-BY 4.0
https://github.com/microsoft/working-with-ai

Adds:
- ms_ai_applicability_scores: 785 SOC-level composite scores
- ms_ai_soc_metrics: 785 SOC-level detailed metrics
- ms_ai_iwa_metrics: 332 IWA-level metrics
- ms_ai_soc_to_iwas: 13,698 SOC-to-IWA mappings
- ms_ai_physical_tasks: 18,796 physical task flags
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ms_ai_applicability_scores",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("soc_code", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("ai_applicability_score", sa.Float(), nullable=True),
        sa.Column("dataset_version", sa.Text(), nullable=False),
    )
    op.create_index("ix_ms_ai_applicability_soc", "ms_ai_applicability_scores", ["soc_code"])

    op.create_table(
        "ms_ai_soc_metrics",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("soc_code", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("coverage_user", sa.Float(), nullable=True),
        sa.Column("coverage_ai", sa.Float(), nullable=True),
        sa.Column("completion_user", sa.Float(), nullable=True),
        sa.Column("completion_ai", sa.Float(), nullable=True),
        sa.Column("feedback_positive_fraction_user", sa.Float(), nullable=True),
        sa.Column("feedback_positive_fraction_ai", sa.Float(), nullable=True),
        sa.Column("impact_scope_user", sa.Float(), nullable=True),
        sa.Column("impact_scope_ai", sa.Float(), nullable=True),
        sa.Column("ai_applicability_score_user", sa.Float(), nullable=True),
        sa.Column("ai_applicability_score_ai_nonphysical", sa.Float(), nullable=True),
        sa.Column("dataset_version", sa.Text(), nullable=False),
    )
    op.create_index("ix_ms_ai_soc_metrics_soc", "ms_ai_soc_metrics", ["soc_code"])

    op.create_table(
        "ms_ai_iwa_metrics",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("iwa_code", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("share_user", sa.Float(), nullable=True),
        sa.Column("share_ai", sa.Float(), nullable=True),
        sa.Column("completion_user", sa.Float(), nullable=True),
        sa.Column("completion_ai", sa.Float(), nullable=True),
        sa.Column("impact_scope_user", sa.Float(), nullable=True),
        sa.Column("impact_scope_ai", sa.Float(), nullable=True),
        sa.Column("feedback_positive_fraction_user", sa.Float(), nullable=True),
        sa.Column("feedback_positive_fraction_ai", sa.Float(), nullable=True),
        sa.Column("completion_x_scope_x_coverage_user", sa.Float(), nullable=True),
        sa.Column("completion_x_scope_x_coverage_ai", sa.Float(), nullable=True),
        sa.Column("dataset_version", sa.Text(), nullable=False),
    )
    op.create_index("ix_ms_ai_iwa_metrics_iwa", "ms_ai_iwa_metrics", ["iwa_code"])

    op.create_table(
        "ms_ai_soc_to_iwas",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("soc_code", sa.Text(), nullable=False),
        sa.Column("iwa_code", sa.Text(), nullable=False),
        sa.Column("dataset_version", sa.Text(), nullable=False),
    )
    op.create_index("ix_ms_ai_soc_to_iwas_soc", "ms_ai_soc_to_iwas", ["soc_code"])
    op.create_index("ix_ms_ai_soc_to_iwas_iwa", "ms_ai_soc_to_iwas", ["iwa_code"])

    op.create_table(
        "ms_ai_physical_tasks",
        sa.Column("task_id", sa.Integer(), primary_key=True),
        sa.Column("physical", sa.Boolean(), nullable=False),
        sa.Column("dataset_version", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ms_ai_physical_tasks")
    op.drop_table("ms_ai_soc_to_iwas")
    op.drop_table("ms_ai_iwa_metrics")
    op.drop_table("ms_ai_soc_metrics")
    op.drop_table("ms_ai_applicability_scores")
