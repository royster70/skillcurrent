"""Migration 027: au_task unified layer + AU-native exposure (FR-9.2, ADR-011).

The unified AU task layer carrying DWA-derived exposure. Each ASC specialist
task (expanded to its OSCA occupations) gets a task-level exposure from its
semantically-matched DWA(s), on the SAME distributed-DWA scale the existing
task_matrix uses for US tasks (AVG(dv_beta_derived)) — apples-to-apples for the
US-vs-AU divergence.

  - au_task              : one row per (osca occupation x task), task_source in
                           (ASC_specialist | OSCA_main | VET_uoc). Exposure in
                           SEPARATE columns (us_imported vs au_native) + a
                           reserved au_native_beta_soc for the later SOC-specific
                           fallback-ladder refinement (decision-point #2).
                           OSCA_main rows are descriptor-only — a CHECK rejects
                           any task-level exposure on them.
  - au_occupation_exposure : task-weighted AU exposure rollup per OSCA, with an
                             honest measured-task coverage %.
"""

import sqlalchemy as sa
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "au_task",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("osca_code", sa.Text(), nullable=False),
        sa.Column("anzsco_code", sa.Text(), nullable=True),  # source occupation
        sa.Column("task_source", sa.Text(), nullable=False),  # ASC_specialist|OSCA_main|VET_uoc
        sa.Column("task_text", sa.Text(), nullable=False),
        sa.Column("percent_of_time", sa.Float(), nullable=True),  # ASC importance weight
        sa.Column("task_level_available", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("task_level_method", sa.Text(), nullable=False, server_default="NA"),  # T2|NA|…
        sa.Column("confidence", sa.Float(), nullable=True),  # bridge cosine
        sa.Column("matched_dwa_id", sa.Text(), nullable=True),
        sa.Column("us_imported_beta", sa.Float(), nullable=True),  # reserved (FR-8.9 occ value)
        sa.Column("au_native_beta", sa.Float(), nullable=True),  # global-AVG matched-DWA exposure
        sa.Column("au_native_beta_soc", sa.Float(), nullable=True),  # reserved SOC-specific ladder
        sa.Column("beta_source", sa.Text(), nullable=True),  # global_avg | soc_specific
        sa.Column("us_au_divergence", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        # OSCA main tasks are descriptors — never carry task-level exposure (domain-model).
        sa.CheckConstraint(
            "task_source <> 'OSCA_main' OR au_native_beta IS NULL",
            name="ck_au_task_osca_main_no_exposure",
        ),
    )
    op.create_index("ix_au_task_osca", "au_task", ["osca_code"])
    op.create_index("ix_au_task_source", "au_task", ["task_source"])
    op.create_index("ix_au_task_method", "au_task", ["task_level_method"])

    op.create_table(
        "au_occupation_exposure",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("osca_code", sa.Text(), nullable=False),
        sa.Column(
            "au_task_beta", sa.Float(), nullable=True
        ),  # time-weighted mean of measured tasks
        sa.Column("task_count", sa.Integer(), nullable=True),
        sa.Column("measured_task_count", sa.Integer(), nullable=True),
        sa.Column("coverage_pct", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("osca_code"),
    )
    op.create_index("ix_au_occ_exposure_osca", "au_occupation_exposure", ["osca_code"])


def downgrade() -> None:
    op.drop_table("au_occupation_exposure")
    op.drop_table("au_task")
