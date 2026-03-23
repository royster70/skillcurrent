"""Add vector embedding columns for semantic search (Layer 2 matching)

Revision ID: 012
Revises: 011
Create Date: 2026-03-23

Adds 384-dimensional vector columns (all-MiniLM-L6-v2) to:
- onet_occupations: occupation description embeddings
- A new dedicated table for title embeddings (more efficient than
  adding columns to both sample + alternate title tables)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Consolidated title embeddings table — combines sample + alternate titles
    op.create_table(
        "onet_title_embeddings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("onet_soc", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),  # 'sample', 'alternate', 'occupation'
    )
    # Add vector column via raw SQL (pgvector type)
    op.execute("ALTER TABLE onet_title_embeddings ADD COLUMN embedding vector(384)")
    op.execute(
        "CREATE INDEX ix_onet_title_embeddings_vec ON onet_title_embeddings "
        "USING hnsw (embedding vector_cosine_ops)"
    )
    op.create_index("ix_onet_title_embeddings_soc", "onet_title_embeddings", ["onet_soc"])
    op.create_index("ix_onet_title_embeddings_source", "onet_title_embeddings", ["source"])


def downgrade() -> None:
    op.drop_table("onet_title_embeddings")
