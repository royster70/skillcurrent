"""API request logging for performance observability (ADR-007)

Revision ID: 015
Revises: 014
Create Date: 2026-03-27

Adds api_request_log table for tracking request durations and patterns.
Index on (path, timestamp) supports slow-endpoint and time-range queries.
"""

from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_request_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Float(), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("request_size", sa.Integer(), nullable=True),
        sa.Column("response_size", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_api_request_log_path_timestamp",
        "api_request_log",
        ["path", "timestamp"],
    )


def downgrade() -> None:
    op.drop_index("ix_api_request_log_path_timestamp", "api_request_log")
    op.drop_table("api_request_log")
