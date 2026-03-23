"""Extend industry_occupation_profiles with multi-source scoring columns

Revision ID: 010
Revises: 009
Create Date: 2026-03-23

Adds Eloundou Beta and Microsoft AI applicability columns to the existing
industry_occupation_profiles table, reflecting the three-tier evidence stack.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("industry_occupation_profiles",
                  sa.Column("eloundou_beta", sa.Float(), nullable=True))
    op.add_column("industry_occupation_profiles",
                  sa.Column("ms_ai_applicability", sa.Float(), nullable=True))
    op.add_column("industry_occupation_profiles",
                  sa.Column("aei_exposure", sa.Float(), nullable=True))
    op.add_column("industry_occupation_profiles",
                  sa.Column("drift_velocity", sa.Float(), nullable=True))
    op.add_column("industry_occupation_profiles",
                  sa.Column("drift_classification", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("industry_occupation_profiles", "drift_classification")
    op.drop_column("industry_occupation_profiles", "drift_velocity")
    op.drop_column("industry_occupation_profiles", "aei_exposure")
    op.drop_column("industry_occupation_profiles", "ms_ai_applicability")
    op.drop_column("industry_occupation_profiles", "eloundou_beta")
