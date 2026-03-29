"""Migration 021: Create abs_census_subdivision_occ table.

Stores Census 2021 TableBuilder cross-tab:
ANZSIC Subdivision (2-digit INDP) × ANZSCO Major Group (1-digit OCCP) × Employed count.

Source: ABS 2021 Census of Population and Housing — TableBuilder
        INDP 2-digit × OCCP 1-digit × LFSP (Employed total)
        CC-BY 4.0 (https://abs.gov.au/ccby)

This fills the data gap between ANZSIC Division and Occupation: we now know
which occupations dominate each subdivision (e.g., Electricity Generation
has more Technicians than Professionals, unlike Financial Intermediation).
"""

from alembic import op
import sqlalchemy as sa

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abs_census_subdivision_occ",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        # ANZSIC Subdivision (2-digit INDP code)
        sa.Column("indp_code", sa.Text, nullable=True),  # e.g. '26' — not in TableBuilder export
        sa.Column("indp_name", sa.Text, nullable=False),   # TableBuilder label
        # Parent ANZSIC Division — derived from INDP code range
        sa.Column("anzsic_division_code", sa.Text, nullable=True),  # 'D', 'K', etc.
        # ANZSCO Major Group (1-digit)
        sa.Column("anzsco_major_group", sa.Integer, nullable=True),  # 1-8, NULL = not stated
        sa.Column("anzsco_major_group_name", sa.Text, nullable=False),
        # Count
        sa.Column("employed_count", sa.Integer, nullable=False),
        # Provenance
        sa.Column("census_year", sa.Integer, nullable=False, server_default="2021"),
        sa.Column("integrity_hash", sa.Text, nullable=True),
    )
    op.create_index(
        "ix_census_sub_occ_div",
        "abs_census_subdivision_occ",
        ["anzsic_division_code"],
    )
    op.create_index(
        "ix_census_sub_occ_indp",
        "abs_census_subdivision_occ",
        ["indp_code"],
    )


def downgrade() -> None:
    op.drop_table("abs_census_subdivision_occ")
