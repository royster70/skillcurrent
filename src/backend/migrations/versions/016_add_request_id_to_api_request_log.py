"""Add request_id column to api_request_log for correlation ID tracking (ADR-007 Phase 2)

Revision ID: 016
Revises: 015
Create Date: 2026-03-27

Adds request_id VARCHAR(36) to api_request_log so each row can be correlated
with the X-Request-ID response header. Index enables fast lookup by correlation ID.
"""

from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_request_log",
        sa.Column("request_id", sa.String(36), nullable=True),
    )
    op.create_index(
        "ix_api_request_log_request_id",
        "api_request_log",
        ["request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_api_request_log_request_id", "api_request_log")
    op.drop_column("api_request_log", "request_id")
