"""Foundational tables: pgvector, O*NET occupations, industry crosswalk

Revision ID: 001
Revises: None
Create Date: 2026-03-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension for future embedding columns
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "onet_occupations",
        sa.Column("onet_soc", sa.String(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_onet_occupations_title", "onet_occupations", ["title"])

    op.create_table(
        "industry_crosswalk",
        sa.Column("source_system", sa.Text(), primary_key=True),
        sa.Column("source_code", sa.Text(), primary_key=True),
        sa.Column("target_system", sa.Text(), primary_key=True),
        sa.Column("target_code", sa.Text(), primary_key=True),
        sa.Column("bridge_system", sa.Text(), nullable=True),
        sa.Column("bridge_code", sa.Text(), nullable=True),
        sa.Column("match_type", sa.Text(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_industry_crosswalk_source", "industry_crosswalk", ["source_system", "source_code"]
    )
    op.create_index(
        "ix_industry_crosswalk_target", "industry_crosswalk", ["target_system", "target_code"]
    )


def downgrade() -> None:
    op.drop_table("industry_crosswalk")
    op.drop_table("onet_occupations")
    op.execute("DROP EXTENSION IF EXISTS vector")
