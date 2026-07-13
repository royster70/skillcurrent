"""Add task_pct column to aei_task_snapshots for overall usage share

Revision ID: 007
Revises: 006
Create Date: 2026-03-23

The AEI temporal releases provide an overall task usage percentage (task_pct)
that is distinct from the automation_pct/augmentation_pct breakdown.
task_pct = share of all conversations mapped to this O*NET task.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("aei_task_snapshots", sa.Column("task_pct", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("aei_task_snapshots", "task_pct")
