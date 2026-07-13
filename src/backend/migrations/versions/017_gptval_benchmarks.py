"""Migration 017: Create gptval_benchmarks table for Epoch AI ECI data.

Stores frontier model benchmark scores from the Epoch AI Capabilities Index (ECI).
This is the "GPTVal aggregate" layer — model-level capability scores across benchmarks,
versioned by model group era.

Source: https://epoch.ai/data/eci_benchmarks.csv (CC-BY, updated regularly)
ADR-006: DataScout acquisition pattern, P0a backlog item.
"""

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gptval_benchmarks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("benchmark", sa.Text, nullable=False),  # e.g. "MMLU", "HumanEval"
        sa.Column("model_group", sa.Text, nullable=False),  # e.g. "Claude 3.5 Sonnet"
        sa.Column("model_era", sa.Text, nullable=False),  # mapped from model_group to platform era
        sa.Column("measurement_date", sa.Date, nullable=True),  # date column from ECI
        sa.Column("score", sa.Float, nullable=False),  # performance 0.0–1.0
        sa.Column("is_math", sa.Boolean, nullable=True),
        sa.Column("is_coding", sa.Boolean, nullable=True),
        sa.Column("source_ref", sa.Text, nullable=True),  # citation / paper name
        sa.Column("dataset_version", sa.Text, nullable=False),  # ECI version (date-stamped)
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )

    # Unique constraint: one score per (benchmark × model_group × dataset_version)
    op.create_unique_constraint(
        "uq_gptval_benchmarks_benchmark_model_version",
        "gptval_benchmarks",
        ["benchmark", "model_group", "dataset_version"],
    )

    # Indexes for waterline velocity queries
    op.create_index("ix_gptval_benchmarks_model_era", "gptval_benchmarks", ["model_era"])
    op.create_index("ix_gptval_benchmarks_benchmark", "gptval_benchmarks", ["benchmark"])
    op.create_index(
        "ix_gptval_benchmarks_era_benchmark",
        "gptval_benchmarks",
        ["model_era", "benchmark"],
    )


def downgrade() -> None:
    op.drop_table("gptval_benchmarks")
