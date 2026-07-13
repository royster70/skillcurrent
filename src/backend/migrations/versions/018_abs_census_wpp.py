"""Migration 018: Create abs_census_wpp table for ABS 2021 Census WPP data.

Stores Working Population Profile (WPP) W12A data:
Industry of Employment (ANZSIC Division) × Occupation (ANZSCO 1-digit major group).

Source: ABS 2021 Census of Population and Housing — Working Population Profiles
        Table W12A: Industry of Employment by Occupation
        Place of Work geography, CC-BY 4.0
        https://www.abs.gov.au/census/find-census-data/datapacks

This is a national-level (AUS) cross-tab of 19 ANZSIC divisions × 8 ANZSCO major groups.
Complements abs_employment (JSA labour force survey estimates) with Census headcounts.
"""

from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abs_census_wpp",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        # Geography
        sa.Column("geography_code", sa.Text, nullable=False),  # e.g. 'AUS'
        # ANZSIC dimension — division letter code (A–S) and abbreviation from WPP
        sa.Column("anzsic_division_code", sa.Text, nullable=False),  # 'A', 'B', ...
        sa.Column("anzsic_division_abbrev", sa.Text, nullable=False),  # 'AgFF', 'Min', ...
        sa.Column("anzsic_division_name", sa.Text, nullable=False),
        # ANZSCO dimension — 1-digit major group (1–8, NULL = not stated)
        sa.Column("anzsco_major_group", sa.Integer, nullable=True),
        sa.Column("anzsco_major_group_abbrev", sa.Text, nullable=False),  # 'Mng', 'Pro', ...
        sa.Column("anzsco_major_group_name", sa.Text, nullable=False),
        # Count
        sa.Column("employed_count", sa.Integer, nullable=True),
        # Provenance
        sa.Column("census_year", sa.Integer, nullable=False, server_default="2021"),
        sa.Column("source_table", sa.Text, nullable=False, server_default="W12A"),
        sa.Column("integrity_hash", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index("ix_abs_census_wpp_anzsic", "abs_census_wpp", ["anzsic_division_code"])
    op.create_index("ix_abs_census_wpp_anzsco", "abs_census_wpp", ["anzsco_major_group"])
    op.create_index(
        "ix_abs_census_wpp_geo_year",
        "abs_census_wpp",
        ["geography_code", "census_year"],
    )
    op.create_unique_constraint(
        "uq_abs_census_wpp_cell",
        "abs_census_wpp",
        [
            "geography_code",
            "anzsic_division_abbrev",
            "anzsco_major_group_abbrev",
            "census_year",
        ],
    )


def downgrade() -> None:
    op.drop_table("abs_census_wpp")
