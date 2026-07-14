"""Migration 032: signal_source_registry (FR-9.5).

The open-source enforcement spine. One row per external data source, carrying a
machine-readable ``redistribution_ok`` boolean alongside its licence, native
grain, url, and status. Two consumers key off it:

  1. the seed / CDN export includes only tables whose every contributing source
     is ``redistribution_ok = true`` (auto-excludes citation-only sources);
  2. the pre-publish check (``scripts/check_redistribution.py``) fails the build
     if a citation-only / view-only / unverified source is ever marked shippable.

Backfills the prose rules in ``NOTICE`` and ``docs/data-sources.md`` into a
queryable table. Tier-1 reference data (public sources only — no org data, no
privacy scope).
"""

import sqlalchemy as sa
from alembic import op

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "signal_source_registry",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_key", sa.Text(), nullable=False),
        sa.Column("source_name", sa.Text(), nullable=False),
        sa.Column("publisher", sa.Text(), nullable=True),
        sa.Column("dataset", sa.Text(), nullable=True),
        sa.Column("licence", sa.Text(), nullable=False),
        sa.Column("redistribution_ok", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("native_grain", sa.Text(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("registry_version", sa.Text(), nullable=False, server_default="2026.07.1"),
        sa.Column("integrity_hash", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_key", name="uq_signal_source_registry_source_key"),
    )
    op.create_index(
        "ix_signal_source_registry_redistribution_ok",
        "signal_source_registry",
        ["redistribution_ok"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_signal_source_registry_redistribution_ok",
        table_name="signal_source_registry",
    )
    op.drop_table("signal_source_registry")
