"""Enable pg_trgm extension and add GIN trigram indexes for fuzzy search

Revision ID: 011
Revises: 010
Create Date: 2026-03-23

Adds trigram indexes on onet_sample_titles.reported_job_title and
onet_alternate_titles.alternate_title for fast fuzzy matching.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_onet_sample_titles_trgm "
        "ON onet_sample_titles USING gin (reported_job_title gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_onet_alternate_titles_trgm "
        "ON onet_alternate_titles USING gin (alternate_title gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_onet_alternate_titles_trgm")
    op.execute("DROP INDEX IF EXISTS ix_onet_sample_titles_trgm")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
