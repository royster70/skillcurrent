"""Migration 024: abs_employment_osca — OSCA-keyed AU employment (FR-9.1, ADR-010).

Stores AU employment apportioned from ANZSCO to OSCA per ADR-010's ladder:
A0 double-count guard (prefer 6-digit detail over 4-digit aggregates), A1 exact
links, A3 equal-split for genuine splits with no finer data. Every row is
method-tagged (link_method) with a confidence, and the apportioned employment
sums back to the de-duplicated ANZSCO base (reconciliation invariant).

One row per (osca_code x anzsic x area x source anzsco_code x year); downstream
sums by osca_code to get OSCA-keyed employment weights.
"""

from alembic import op
import sqlalchemy as sa

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abs_employment_osca",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("osca_code", sa.Text(), nullable=False),
        sa.Column("anzsco_code", sa.Text(), nullable=False),  # source ANZSCO
        sa.Column("anzsic_code", sa.Text(), nullable=False),
        sa.Column("area_code", sa.Text(), nullable=False, server_default="AU0000"),
        sa.Column("apportioned_employment", sa.Float(), nullable=True),
        sa.Column("link_method", sa.Text(), nullable=False),  # full | apportioned_equal | apportioned_employment
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("release_year", sa.Integer(), nullable=False),
        sa.Column("osca_version", sa.Text(), nullable=False, server_default="2024.1.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_abs_emp_osca_osca", "abs_employment_osca", ["osca_code"])
    op.create_index("ix_abs_emp_osca_anzsco", "abs_employment_osca", ["anzsco_code"])
    op.create_index("ix_abs_emp_osca_method", "abs_employment_osca", ["link_method"])


def downgrade() -> None:
    op.drop_table("abs_employment_osca")
