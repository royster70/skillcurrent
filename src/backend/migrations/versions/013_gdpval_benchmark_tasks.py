"""GDPval benchmark tasks — OpenAI real-world knowledge task evaluations

Revision ID: 013
Revises: 012
Create Date: 2026-03-24

Stores the GDPval benchmark definition: 220 real-world knowledge tasks
across 44 occupations with evaluation rubrics. Tasks are mapped to O*NET
SOC codes for cross-referencing with existing exposure/drift data.

When model evaluation scores are collected across eras, this enables
longitudinal waterline velocity tracking at the occupation level (FR-8.7).

Source: https://huggingface.co/datasets/openai/gdpval
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gdpval_tasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Text(), nullable=False, unique=True),
        sa.Column("occupation_title", sa.Text(), nullable=False),
        sa.Column("onet_soc", sa.Text(), nullable=True),
        sa.Column("sector", sa.Text(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("rubric_item_count", sa.Integer(), nullable=False),
        sa.Column("max_score", sa.Integer(), nullable=True),
        sa.Column("min_score", sa.Integer(), nullable=True),
        sa.Column("reference_file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deliverable_file_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_gdpval_tasks_onet_soc", "gdpval_tasks", ["onet_soc"])
    op.create_index("ix_gdpval_tasks_sector", "gdpval_tasks", ["sector"])
    op.create_index("ix_gdpval_tasks_occupation", "gdpval_tasks", ["occupation_title"])

    op.create_table(
        "gdpval_rubric_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Text(), nullable=False),
        sa.Column("rubric_item_id", sa.Text(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("criterion", sa.Text(), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("author_type", sa.Text(), nullable=False, server_default="human"),
        sa.Column("tags", sa.Text(), nullable=True),  # JSON array stored as text
    )
    op.create_index("ix_gdpval_rubric_items_task_id", "gdpval_rubric_items", ["task_id"])
    op.create_foreign_key(
        "fk_gdpval_rubric_task",
        "gdpval_rubric_items",
        "gdpval_tasks",
        ["task_id"],
        ["task_id"],
    )

    # Future table for model evaluation scores per task per era
    op.create_table(
        "gdpval_evaluations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Text(), nullable=False),
        sa.Column("model_era", sa.Text(), nullable=False),
        sa.Column("model_name", sa.Text(), nullable=True),
        sa.Column("evaluation_date", sa.Date(), nullable=True),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("max_possible_score", sa.Float(), nullable=True),
        sa.Column("completion_pct", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_gdpval_evaluations_task_id", "gdpval_evaluations", ["task_id"])
    op.create_index("ix_gdpval_evaluations_model_era", "gdpval_evaluations", ["model_era"])
    op.create_unique_constraint(
        "uq_gdpval_eval_task_era",
        "gdpval_evaluations",
        ["task_id", "model_era"],
    )
    op.create_foreign_key(
        "fk_gdpval_eval_task",
        "gdpval_evaluations",
        "gdpval_tasks",
        ["task_id"],
        ["task_id"],
    )


def downgrade() -> None:
    op.drop_table("gdpval_evaluations")
    op.drop_table("gdpval_rubric_items")
    op.drop_table("gdpval_tasks")
