"""AEI labor market impact tables — job exposure and task penetration

Revision ID: 006
Revises: 005
Create Date: 2026-03-23

Source: Anthropic Economic Index (CC-BY)
https://huggingface.co/datasets/Anthropic/EconomicIndex

Adds:
- aei_job_exposure: 756 occupation-level observed AI exposure scores
- aei_task_penetration: 17,998 task-level AI penetration scores
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aei_job_exposure",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("occ_code", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("observed_exposure", sa.Float(), nullable=True),
        sa.Column("dataset_version", sa.Text(), nullable=False),
    )
    op.create_index("ix_aei_job_exposure_occ_code", "aei_job_exposure", ["occ_code"])

    op.create_table(
        "aei_task_penetration",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("penetration", sa.Float(), nullable=True),
        sa.Column("dataset_version", sa.Text(), nullable=False),
    )
    op.create_index("ix_aei_task_penetration_penetration", "aei_task_penetration", ["penetration"])


def downgrade() -> None:
    op.drop_table("aei_task_penetration")
    op.drop_table("aei_job_exposure")
