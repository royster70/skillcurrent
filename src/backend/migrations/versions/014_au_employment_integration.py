"""AU employment integration — region column, abs_employment, anzsco_soc_concordance

Revision ID: 014
Revises: 013
Create Date: 2026-03-25

Adds Australian employment data support:
- region column on industry_occupation_profiles (US/AU discriminator)
- abs_employment table (ABS Labour Force Survey data by ANZSCO × ANZSIC)
- anzsco_soc_concordance table (ANZSCO → O*NET SOC semantic matching results)

The existing US data is backfilled with region='US'. AU data will use
ANZSIC division codes in the naics_code column (pragmatic reuse).
"""

from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add region column to industry_occupation_profiles ──

    op.add_column(
        "industry_occupation_profiles",
        sa.Column("region", sa.Text(), nullable=False, server_default="US"),
    )

    # Backfill existing rows
    op.execute("UPDATE industry_occupation_profiles SET region = 'US' WHERE region IS NULL")

    # Drop old unique constraint (PostgreSQL truncated name to 63 chars) and create new one with region
    op.drop_constraint(
        "industry_occupation_profiles_naics_code_onet_soc_release_ye_key",
        "industry_occupation_profiles",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_iop_naics_soc_year_region",
        "industry_occupation_profiles",
        ["naics_code", "onet_soc", "release_year", "region"],
    )
    op.create_index(
        "ix_industry_occupation_profiles_region",
        "industry_occupation_profiles",
        ["region"],
    )

    # ── 2. Create abs_employment table ──

    op.create_table(
        "abs_employment",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("anzsco_code", sa.Text(), nullable=False),
        sa.Column("anzsco_title", sa.Text(), nullable=True),
        sa.Column("anzsic_code", sa.Text(), nullable=False),
        sa.Column("anzsic_title", sa.Text(), nullable=True),
        sa.Column("area_code", sa.Text(), nullable=False, server_default="AU0000"),
        sa.Column("employment", sa.Integer(), nullable=True),
        sa.Column("employment_per_1000", sa.Float(), nullable=True),
        sa.Column("median_annual_wage", sa.Integer(), nullable=True),
        sa.Column("release_year", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("anzsco_code", "anzsic_code", "area_code", "release_year"),
    )
    op.create_index("ix_abs_employment_anzsco", "abs_employment", ["anzsco_code"])
    op.create_index("ix_abs_employment_anzsic", "abs_employment", ["anzsic_code"])
    op.create_index("ix_abs_employment_release_year", "abs_employment", ["release_year"])

    # ── 3. Create anzsco_soc_concordance table ──

    op.create_table(
        "anzsco_soc_concordance",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("anzsco_code", sa.Text(), nullable=False),
        sa.Column("anzsco_title", sa.Text(), nullable=False),
        sa.Column("onet_soc", sa.Text(), nullable=False),
        sa.Column("onet_title", sa.Text(), nullable=True),
        sa.Column("match_method", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("matched_variant", sa.Text(), nullable=True),
        sa.Column("reviewed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("anzsco_code", "onet_soc"),
    )
    op.create_index("ix_anzsco_soc_anzsco", "anzsco_soc_concordance", ["anzsco_code"])
    op.create_index("ix_anzsco_soc_onet", "anzsco_soc_concordance", ["onet_soc"])
    op.create_index("ix_anzsco_soc_confidence", "anzsco_soc_concordance", ["confidence"])


def downgrade() -> None:
    # Drop new tables
    op.drop_table("anzsco_soc_concordance")
    op.drop_table("abs_employment")

    # Remove region from industry_occupation_profiles
    op.drop_index("ix_industry_occupation_profiles_region", "industry_occupation_profiles")
    op.drop_constraint(
        "uq_iop_naics_soc_year_region",
        "industry_occupation_profiles",
        type_="unique",
    )
    op.create_unique_constraint(
        "industry_occupation_profiles_naics_code_onet_soc_release_ye_key",
        "industry_occupation_profiles",
        ["naics_code", "onet_soc", "release_year"],
    )
    op.drop_column("industry_occupation_profiles", "region")
