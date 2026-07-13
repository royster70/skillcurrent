"""Migration 026: DWA<->ASC semantic bridge infrastructure (FR-9.2, ADR-011 L2).

The DWA pivot's task-level rung is semantic (no source-DWA lineage in ASC v3.0,
Phase B0). This migration adds the embedding + bridge tables:

  - dwa_embeddings       : one row per O*NET DWA (dwa_id, dwa_title, vector(384))
  - asc_task_embeddings  : one row per DISTINCT ASC specialist-task text
  - dwa_asc_bridge       : top-k (specialist_task -> dwa_id) matches with cosine
                           similarity and confidence, floored at 0.60 (ADR-011).

Bridging on the distinct task TEXT (not per asc_specialist_task row) because the
same task recurs across occupations; exposure joins back to all occurrences by
text. Embedding columns/index added via raw SQL (pgvector), mirroring
onet_title_embeddings (migration 012). No ORM models (raw-SQL access).
"""

import sqlalchemy as sa
from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── DWA embeddings ──
    op.create_table(
        "dwa_embeddings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dwa_id", sa.Text(), nullable=False),
        sa.Column("dwa_title", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dwa_id"),
    )
    op.execute("ALTER TABLE dwa_embeddings ADD COLUMN embedding vector(384)")
    op.execute(
        "CREATE INDEX ix_dwa_embeddings_vec ON dwa_embeddings "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    # ── ASC specialist-task embeddings (distinct text) ──
    op.create_table(
        "asc_task_embeddings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("specialist_task", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("specialist_task"),
    )
    op.execute("ALTER TABLE asc_task_embeddings ADD COLUMN embedding vector(384)")
    op.execute(
        "CREATE INDEX ix_asc_task_embeddings_vec ON asc_task_embeddings "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    # ── The bridge: (specialist_task text -> dwa_id) semantic matches ──
    op.create_table(
        "dwa_asc_bridge",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("specialist_task", sa.Text(), nullable=False),
        sa.Column("dwa_id", sa.Text(), nullable=False),
        sa.Column("cosine_similarity", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("method", sa.Text(), nullable=False, server_default="semantic"),
        sa.Column("rank", sa.Integer(), nullable=True),  # 1 = nearest
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dwa_asc_bridge_task", "dwa_asc_bridge", ["specialist_task"])
    op.create_index("ix_dwa_asc_bridge_dwa", "dwa_asc_bridge", ["dwa_id"])


def downgrade() -> None:
    op.drop_table("dwa_asc_bridge")
    op.drop_table("asc_task_embeddings")
    op.drop_table("dwa_embeddings")
