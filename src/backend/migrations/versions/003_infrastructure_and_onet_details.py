"""Infrastructure tables (ADR-001/002) and O*NET detail tables for ingestion

Revision ID: 003
Revises: 002
Create Date: 2026-03-23

Adds:
- dataset_versions: Version registry for all reference datasets (ADR-002)
- dataset_version_deltas: Pre-computed diffs between versions (ADR-002)
- transformation_log: Lineage tracking for derived computations (ADR-001)
- onet_task_statements: ~18,800 task descriptions per occupation
- onet_task_ratings: Importance/relevance scores per task
- onet_dwa_references: ~2,087 Detailed Work Activity definitions
- onet_tasks_to_dwas: Direct task-to-DWA mapping
- onet_work_activities: ~73k DWA ratings per occupation
- onet_sample_titles: ~7,953 sample job titles (Layer 1 matching)
- onet_alternate_titles: ~57,543 alternate titles (Layer 1 matching)
- onet_emerging_tasks: 328 emerging tasks
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Infrastructure: ADR-002 dataset versioning ──

    op.create_table(
        "dataset_versions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("dataset_name", sa.Text(), nullable=False),
        sa.Column("version_key", sa.Text(), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("integrity_hash", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("metadata", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.UniqueConstraint("dataset_name", "version_key", name="uq_dataset_version"),
    )

    op.create_table(
        "dataset_version_deltas",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("dataset_name", sa.Text(), nullable=False),
        sa.Column(
            "from_version_id",
            sa.Integer(),
            sa.ForeignKey("dataset_versions.id"),
            nullable=True,
        ),
        sa.Column(
            "to_version_id",
            sa.Integer(),
            sa.ForeignKey("dataset_versions.id"),
            nullable=False,
        ),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("records_added", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_removed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_changed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("delta_detail", sa.dialects.postgresql.JSONB(), nullable=False),
    )

    # ── Infrastructure: ADR-001 transformation lineage ──

    op.create_table(
        "transformation_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("source_tables", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("target_table", sa.Text(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rows_affected", sa.Integer(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="running"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("parameters", sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.create_index("ix_transformation_log_name", "transformation_log", ["name"])
    op.create_index("ix_transformation_log_target", "transformation_log", ["target_table"])
    op.create_index("ix_transformation_log_status", "transformation_log", ["status"])

    # ── O*NET detail tables ──

    op.create_table(
        "onet_task_statements",
        sa.Column(
            "onet_soc", sa.Text(), sa.ForeignKey("onet_occupations.onet_soc"), primary_key=True
        ),
        sa.Column("task_id", sa.Integer(), primary_key=True),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("task_type", sa.Text(), nullable=True),
        sa.Column("incumbents_responding", sa.Integer(), nullable=True),
        sa.Column("date", sa.Text(), nullable=True),
        sa.Column("domain_source", sa.Text(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_onet_task_statements_onet_soc", "onet_task_statements", ["onet_soc"])
    op.create_index("ix_onet_task_statements_task_id", "onet_task_statements", ["task_id"])

    op.create_table(
        "onet_task_ratings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "onet_soc", sa.Text(), sa.ForeignKey("onet_occupations.onet_soc"), nullable=False
        ),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("scale_id", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("data_value", sa.Float(), nullable=True),
        sa.Column("n", sa.Integer(), nullable=True),
        sa.Column("standard_error", sa.Float(), nullable=True),
        sa.Column("lower_ci_bound", sa.Float(), nullable=True),
        sa.Column("upper_ci_bound", sa.Float(), nullable=True),
        sa.Column("recommend_suppress", sa.Text(), nullable=True),
        sa.Column("date", sa.Text(), nullable=True),
        sa.Column("domain_source", sa.Text(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_onet_task_ratings_onet_soc", "onet_task_ratings", ["onet_soc"])
    op.create_index("ix_onet_task_ratings_task_id", "onet_task_ratings", ["task_id"])
    op.create_index("ix_onet_task_ratings_scale_id", "onet_task_ratings", ["scale_id"])

    op.create_table(
        "onet_dwa_references",
        sa.Column("dwa_id", sa.Text(), primary_key=True),
        sa.Column("element_id", sa.Text(), nullable=False),
        sa.Column("iwa_id", sa.Text(), nullable=False),
        sa.Column("dwa_title", sa.Text(), nullable=False),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_onet_dwa_references_element_id", "onet_dwa_references", ["element_id"])

    op.create_table(
        "onet_tasks_to_dwas",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "onet_soc", sa.Text(), sa.ForeignKey("onet_occupations.onet_soc"), nullable=False
        ),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("dwa_id", sa.Text(), nullable=False),
        sa.Column("date", sa.Text(), nullable=True),
        sa.Column("domain_source", sa.Text(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_onet_tasks_to_dwas_onet_soc", "onet_tasks_to_dwas", ["onet_soc"])
    op.create_index("ix_onet_tasks_to_dwas_task_id", "onet_tasks_to_dwas", ["task_id"])
    op.create_index("ix_onet_tasks_to_dwas_dwa_id", "onet_tasks_to_dwas", ["dwa_id"])

    op.create_table(
        "onet_work_activities",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "onet_soc", sa.Text(), sa.ForeignKey("onet_occupations.onet_soc"), nullable=False
        ),
        sa.Column("element_id", sa.Text(), nullable=False),
        sa.Column("element_name", sa.Text(), nullable=False),
        sa.Column("scale_id", sa.Text(), nullable=False),
        sa.Column("data_value", sa.Float(), nullable=True),
        sa.Column("n", sa.Integer(), nullable=True),
        sa.Column("standard_error", sa.Float(), nullable=True),
        sa.Column("lower_ci_bound", sa.Float(), nullable=True),
        sa.Column("upper_ci_bound", sa.Float(), nullable=True),
        sa.Column("recommend_suppress", sa.Text(), nullable=True),
        sa.Column("not_relevant", sa.Text(), nullable=True),
        sa.Column("date", sa.Text(), nullable=True),
        sa.Column("domain_source", sa.Text(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_onet_work_activities_onet_soc", "onet_work_activities", ["onet_soc"])
    op.create_index("ix_onet_work_activities_element_id", "onet_work_activities", ["element_id"])
    op.create_index("ix_onet_work_activities_scale_id", "onet_work_activities", ["scale_id"])

    op.create_table(
        "onet_sample_titles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "onet_soc", sa.Text(), sa.ForeignKey("onet_occupations.onet_soc"), nullable=False
        ),
        sa.Column("reported_job_title", sa.Text(), nullable=False),
        sa.Column("shown_in_my_next_move", sa.Text(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_onet_sample_titles_onet_soc", "onet_sample_titles", ["onet_soc"])
    op.create_index("ix_onet_sample_titles_title", "onet_sample_titles", ["reported_job_title"])

    op.create_table(
        "onet_alternate_titles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "onet_soc", sa.Text(), sa.ForeignKey("onet_occupations.onet_soc"), nullable=False
        ),
        sa.Column("alternate_title", sa.Text(), nullable=False),
        sa.Column("short_title", sa.Text(), nullable=True),
        sa.Column("sources", sa.Text(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_onet_alternate_titles_onet_soc", "onet_alternate_titles", ["onet_soc"])
    op.create_index("ix_onet_alternate_titles_title", "onet_alternate_titles", ["alternate_title"])

    op.create_table(
        "onet_emerging_tasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "onet_soc", sa.Text(), sa.ForeignKey("onet_occupations.onet_soc"), nullable=False
        ),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("original_task_id", sa.Text(), nullable=True),
        sa.Column("original_task", sa.Text(), nullable=True),
        sa.Column("date", sa.Text(), nullable=True),
        sa.Column("domain_source", sa.Text(), nullable=True),
        sa.Column("onet_version", sa.Text(), nullable=False, server_default="28.1"),
    )
    op.create_index("ix_onet_emerging_tasks_onet_soc", "onet_emerging_tasks", ["onet_soc"])
    op.create_index("ix_onet_emerging_tasks_category", "onet_emerging_tasks", ["category"])


def downgrade() -> None:
    op.drop_table("onet_emerging_tasks")
    op.drop_table("onet_alternate_titles")
    op.drop_table("onet_sample_titles")
    op.drop_table("onet_work_activities")
    op.drop_table("onet_tasks_to_dwas")
    op.drop_table("onet_dwa_references")
    op.drop_table("onet_task_ratings")
    op.drop_table("onet_task_statements")
    op.drop_table("transformation_log")
    op.drop_table("dataset_version_deltas")
    op.drop_table("dataset_versions")
