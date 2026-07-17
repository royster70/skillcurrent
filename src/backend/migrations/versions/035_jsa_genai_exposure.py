"""Migration 035: jsa_genai_exposure (FR-9.x).

Jobs and Skills Australia "Our Gen AI Transition" (Aug 2025) — the platform's
first published AU-NATIVE AI-exposure signal, keyed by 4-digit ANZSCO unit
group. Augmentation + automation exposure (each 0–1, independent) plus
supplementary skill-transition metrics.

Kept as its own signal — never blended with the DWA→ASC bridge-derived
au_task_beta (CLAUDE.md: US-imported and AU-native exposure stay separate). CC
BY 4.0, redistributable (signal_source_registry key `jsa_genai`).

Tier-1 reference data (public sources only — no org data, no privacy scope).
"""

import sqlalchemy as sa
from alembic import op

revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "jsa_genai_exposure",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("anzsco_code", sa.Text(), nullable=False),
        sa.Column("anzsco_title", sa.Text(), nullable=True),
        sa.Column("matrix_group", sa.Text(), nullable=True),
        sa.Column("augmentation_score", sa.Float(), nullable=True),
        sa.Column("automation_score", sa.Float(), nullable=True),
        sa.Column("rate_of_skill_change", sa.Float(), nullable=True),
        sa.Column("historical_mobility", sa.Float(), nullable=True),
        sa.Column("high_fit_transition_rate", sa.Float(), nullable=True),
        sa.Column("hybridisation_potential", sa.Float(), nullable=True),
        sa.Column("specialisation_potential", sa.Float(), nullable=True),
        sa.Column("entry_level_ad_share", sa.Float(), nullable=True),
        sa.Column("jsa_version", sa.Text(), nullable=False, server_default="2025.08"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("anzsco_code", "jsa_version", name="uq_jsa_genai_anzsco_version"),
    )
    op.create_index("ix_jsa_genai_exposure_anzsco_code", "jsa_genai_exposure", ["anzsco_code"])


def downgrade() -> None:
    op.drop_index("ix_jsa_genai_exposure_anzsco_code", table_name="jsa_genai_exposure")
    op.drop_table("jsa_genai_exposure")
