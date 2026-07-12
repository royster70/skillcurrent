"""Migration 025: Australian Skills Classification (ASC v3.0) — 3 layers (FR-9.2).

Ingests the JSA Australian Skills Classification (acquired via the `strayr`
package). ASC is the AU-native task/skill layer and the exposure carrier for
the DWA pivot (ADR-011): specialist tasks were built from O*NET DWAs, so
DWA-level exposure attaches to them (via the semantic bridge — the published
files carry NO source-DWA column, confirmed by the Phase B0 spike).

Three layers, all keyed on 4-digit ANZSCO:
  - asc_specialist_task   (10,963 rows) — the exposure-bearing task layer;
      `source_dwa_id` nullable (stays NULL for ASC v3.0; reserved for a future
      lineage-bearing release / the L1 dwa_lookup rung).
  - asc_core_competency   (6,000 rows)  — 10 competencies, scored + proficiency.
  - asc_technology_tool   (1,989 rows).

Source: JSA Australian Skills Classification v3.0 (CC BY 4.0), via
        runapp-aus/strayr. See ADR-011 and docs/data-sources.md.
"""

import sqlalchemy as sa
from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asc_specialist_task",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("anzsco_code", sa.Text(), nullable=False),
        sa.Column("anzsco_name", sa.Text(), nullable=True),
        sa.Column("specialist_task", sa.Text(), nullable=False),
        sa.Column("percent_of_time_spent_on_task", sa.Float(), nullable=True),
        sa.Column("specialist_cluster", sa.Text(), nullable=True),
        sa.Column("percent_of_time_spent_on_cluster", sa.Float(), nullable=True),
        sa.Column("cluster_family", sa.Text(), nullable=True),
        sa.Column("percent_of_time_spent_on_family", sa.Float(), nullable=True),
        sa.Column("source_dwa_id", sa.Text(), nullable=True),  # ADR-011 L1 reserve (NULL for v3.0)
        sa.Column("asc_version", sa.Text(), nullable=False, server_default="3.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_asc_specialist_task_anzsco", "asc_specialist_task", ["anzsco_code"])
    op.create_index("ix_asc_specialist_task_dwa", "asc_specialist_task", ["source_dwa_id"])

    op.create_table(
        "asc_core_competency",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("anzsco_code", sa.Text(), nullable=False),
        sa.Column("anzsco_name", sa.Text(), nullable=True),
        sa.Column("core_competency", sa.Text(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("proficiency_level", sa.Text(), nullable=True),
        sa.Column("anchor_value", sa.Text(), nullable=True),
        sa.Column("asc_version", sa.Text(), nullable=False, server_default="3.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_asc_core_competency_anzsco", "asc_core_competency", ["anzsco_code"])

    op.create_table(
        "asc_technology_tool",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("anzsco_code", sa.Text(), nullable=False),
        sa.Column("anzsco_name", sa.Text(), nullable=True),
        sa.Column("technology_tool", sa.Text(), nullable=False),
        sa.Column("asc_version", sa.Text(), nullable=False, server_default="3.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_asc_technology_tool_anzsco", "asc_technology_tool", ["anzsco_code"])


def downgrade() -> None:
    op.drop_table("asc_technology_tool")
    op.drop_table("asc_core_competency")
    op.drop_table("asc_specialist_task")
