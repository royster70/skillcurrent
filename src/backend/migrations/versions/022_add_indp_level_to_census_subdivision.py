"""Migration 022: Add indp_level column to abs_census_subdivision_occ.

The original migration (021) loaded ABS Census 2021 TableBuilder data at
2-digit ANZSIC INDP granularity (Subdivision level) — 838 rows for AUS.

Census TableBuilder also exposes a 3-digit INDP level (ANZSIC Group), which
we want to ingest for finer occupation-mix analysis on selected divisions
(initially C/D/G/K, token-limited at the export step). Both granularities
must coexist in the same table so the existing FR-8.9 endpoints can keep
querying without a schema split.

`indp_level` distinguishes the two:
  2 = ANZSIC Subdivision (2-digit INDP) — original 838 rows
  3 = ANZSIC Group       (3-digit INDP) — new long-format ingest

Backfill rationale: every existing row in abs_census_subdivision_occ was
loaded from a 2-digit pivot CSV, so server_default=2 is the correct value
for the existing 838 rows. New 3-digit ingests pass level=3 explicitly via
the script's --level flag and bypass the default.
"""

from alembic import op
import sqlalchemy as sa

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NOT NULL with server_default backfills existing rows to 2 in a single
    # pass — safe because every pre-022 row is genuinely subdivision-level.
    op.add_column(
        "abs_census_subdivision_occ",
        sa.Column(
            "indp_level",
            sa.Integer,
            nullable=False,
            server_default="2",
        ),
    )
    op.create_index(
        "ix_census_sub_occ_level",
        "abs_census_subdivision_occ",
        ["indp_level"],
    )


def downgrade() -> None:
    op.drop_index("ix_census_sub_occ_level", table_name="abs_census_subdivision_occ")
    op.drop_column("abs_census_subdivision_occ", "indp_level")
