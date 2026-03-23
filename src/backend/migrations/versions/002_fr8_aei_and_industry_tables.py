"""FR-8.1 AEI task snapshots, FR-8.4 OEWS employment and industry occupation profiles

Revision ID: 002
Revises: 001
Create Date: 2026-03-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # FR-8.1: AEI task snapshots (append-only temporal store)
    op.create_table(
        "aei_task_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_text", sa.Text(), nullable=False),
        sa.Column("onet_soc_codes", sa.ARRAY(sa.Text()), nullable=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("release_version", sa.Text(), nullable=False),
        sa.Column("model_era", sa.Text(), nullable=False),
        sa.Column("automation_pct", sa.Float(), nullable=True),
        sa.Column("augmentation_pct", sa.Float(), nullable=True),
        sa.Column("platform", sa.Text(), nullable=False, server_default="global"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("task_text", "snapshot_date", "platform"),
    )
    op.create_index("ix_aei_task_snapshots_snapshot_date", "aei_task_snapshots", ["snapshot_date"])
    op.create_index(
        "ix_aei_task_snapshots_release_version", "aei_task_snapshots", ["release_version"]
    )
    op.create_index("ix_aei_task_snapshots_model_era", "aei_task_snapshots", ["model_era"])
    op.create_index("ix_aei_task_snapshots_platform", "aei_task_snapshots", ["platform"])
    op.create_index(
        "ix_aei_task_snapshots_onet_soc_codes",
        "aei_task_snapshots",
        ["onet_soc_codes"],
        postgresql_using="gin",
    )

    # FR-8.4: Raw BLS OEWS employment data
    op.create_table(
        "oews_employment",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("onet_soc", sa.Text(), nullable=False),
        sa.Column("naics_code", sa.Text(), nullable=False),
        sa.Column("naics_title", sa.Text(), nullable=True),
        sa.Column("area_code", sa.Text(), nullable=False, server_default="US0000"),
        sa.Column("employment", sa.Integer(), nullable=True),
        sa.Column("employment_per_1000", sa.Float(), nullable=True),
        sa.Column("mean_annual_wage", sa.Integer(), nullable=True),
        sa.Column("median_annual_wage", sa.Integer(), nullable=True),
        sa.Column("release_year", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("onet_soc", "naics_code", "area_code", "release_year"),
        sa.ForeignKeyConstraint(["onet_soc"], ["onet_occupations.onet_soc"]),
    )
    op.create_index("ix_oews_employment_onet_soc", "oews_employment", ["onet_soc"])
    op.create_index("ix_oews_employment_naics_code", "oews_employment", ["naics_code"])
    op.create_index("ix_oews_employment_release_year", "oews_employment", ["release_year"])

    # FR-8.4: Derived industry occupation profiles (recomputed, not materialized view)
    op.create_table(
        "industry_occupation_profiles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("naics_code", sa.Text(), nullable=False),
        sa.Column("naics_title", sa.Text(), nullable=True),
        sa.Column("onet_soc", sa.Text(), nullable=False),
        sa.Column("occupation_title", sa.Text(), nullable=True),
        sa.Column("employment_share", sa.Float(), nullable=True),
        sa.Column("headcount", sa.Integer(), nullable=True),
        sa.Column("avg_automation_pct", sa.Float(), nullable=True),
        sa.Column("avg_augmentation_pct", sa.Float(), nullable=True),
        sa.Column("dominant_zone", sa.Text(), nullable=True),
        sa.Column("profile_date", sa.Date(), nullable=False),
        sa.Column("release_year", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("naics_code", "onet_soc", "release_year"),
        sa.ForeignKeyConstraint(["onet_soc"], ["onet_occupations.onet_soc"]),
    )
    op.create_index(
        "ix_industry_occupation_profiles_naics_code", "industry_occupation_profiles", ["naics_code"]
    )
    op.create_index(
        "ix_industry_occupation_profiles_onet_soc", "industry_occupation_profiles", ["onet_soc"]
    )
    op.create_index(
        "ix_industry_occupation_profiles_dominant_zone",
        "industry_occupation_profiles",
        ["dominant_zone"],
    )


def downgrade() -> None:
    op.drop_table("industry_occupation_profiles")
    op.drop_table("oews_employment")
    op.drop_table("aei_task_snapshots")
