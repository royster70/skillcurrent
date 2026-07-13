"""Migration 020: Create anzsic_subdivisions table for ANZSIC sub-sector data.

Stores ANZSIC subdivision-level employment from JSA Industry Data Table 3.
214 subdivisions across 19 ANZSIC divisions with employment headcounts.

Source: Jobs and Skills Australia — Industry Data, November 2025 (Revised)
        Table 3: Employment by sector
"""

import sqlalchemy as sa
from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "anzsic_subdivisions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("anzsic_division_code", sa.Text, nullable=False),  # A-S
        sa.Column("anzsic_division_name", sa.Text, nullable=False),
        sa.Column("subdivision_name", sa.Text, nullable=False),
        sa.Column("employment", sa.Integer, nullable=True),
        sa.Column("release_year", sa.Integer, nullable=False, server_default="2025"),
        sa.Column("integrity_hash", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index(
        "ix_anzsic_subdivisions_division",
        "anzsic_subdivisions",
        ["anzsic_division_code"],
    )
    op.create_unique_constraint(
        "uq_anzsic_subdivisions_row",
        "anzsic_subdivisions",
        ["anzsic_division_code", "subdivision_name", "release_year"],
    )


def downgrade() -> None:
    op.drop_table("anzsic_subdivisions")
