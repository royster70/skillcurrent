"""Migration 019: Create abs_census_w13 table for ABS 2021 Census WPP data.

Stores Working Population Profile (WPP) W13 data:
Occupation (ANZSCO sub-major group) × Sex, national level.

Source: ABS 2021 Census of Population and Housing — Working Population Profiles
        Table W13: Occupation by Sex
        Place of Work geography, CC-BY 4.0
        https://www.abs.gov.au/census/find-census-data/datapacks

This is a national-level (AUS) cross-tab of ~51 ANZSCO sub-major groups × 3 sex codes (M/F/P).
Complements W12A (industry × occupation) with gender breakdown per occupation category.
"""

import sqlalchemy as sa
from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abs_census_w13",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        # Geography
        sa.Column("geography_code", sa.Text, nullable=False),  # e.g. 'AUS'
        # ANZSCO major group (1-digit parent)
        sa.Column("anzsco_major_group", sa.Integer, nullable=True),  # 1-8, NULL for special
        sa.Column("anzsco_major_group_name", sa.Text, nullable=False),
        # ANZSCO sub-major group (2-digit)
        sa.Column("anzsco_submajor_code", sa.Text, nullable=True),  # '11', '12', etc.
        sa.Column("anzsco_submajor_abbrev", sa.Text, nullable=False),  # CSV abbreviation
        sa.Column("anzsco_submajor_name", sa.Text, nullable=False),
        # Sex
        sa.Column("sex", sa.Text, nullable=False),  # 'M', 'F', 'P'
        # Count
        sa.Column("employed_count", sa.Integer, nullable=True),
        # Provenance
        sa.Column("census_year", sa.Integer, nullable=False, server_default="2021"),
        sa.Column("source_table", sa.Text, nullable=False, server_default="W13"),
        sa.Column("integrity_hash", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index("ix_abs_census_w13_major", "abs_census_w13", ["anzsco_major_group"])
    op.create_index("ix_abs_census_w13_submajor", "abs_census_w13", ["anzsco_submajor_code"])
    op.create_index("ix_abs_census_w13_sex", "abs_census_w13", ["sex"])
    op.create_index(
        "ix_abs_census_w13_geo_year",
        "abs_census_w13",
        ["geography_code", "census_year"],
    )
    op.create_unique_constraint(
        "uq_abs_census_w13_cell",
        "abs_census_w13",
        [
            "geography_code",
            "anzsco_submajor_abbrev",
            "sex",
            "census_year",
        ],
    )


def downgrade() -> None:
    op.drop_table("abs_census_w13")
