"""Migration 031: Add pipeline_run_id to transformation_log (ADR-007 Phase 3).

FR-8.8 turns the pipeline orchestrator into a real rebuild path. ADR-007 Phase 3
Rule 2 requires every derived computation run under the orchestrator to carry the
batch correlation key ``pipeline_run_id`` (a UUID4 generated per run in
``scripts/run_pipeline.py``). This column stores it so a full rebuild's derived
stages (drift, DWA derivation, industry profiles) can be traced as one unit.

Nullable: ad-hoc CLI runs of a single computation outside the orchestrator leave
it NULL, which is the correct "no active pipeline run" signal. ``request_id`` and
``pipeline_run_id`` never co-occur on a row.

Numbering: chains onto the feat/fr9-osca-backbone head (030_drop_iop_onet_fk).
This FR-8.8 work branched from 022 in parallel with fr9-osca's 023–030; renumbered
to 031 at merge-prep time so the two lines form one linear Alembic chain. The SOC
foreign-key drop this FR-8.8 work originally shipped (as a local 028) is now
handled by trunk's 029_drop_oews_onet_fk + 030_drop_iop_onet_fk, so that migration
was dropped here as redundant — only the OEWS-grain guardrail tests remain (see
tests/test_data_invariants.py).
"""

import sqlalchemy as sa
from alembic import op

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transformation_log",
        sa.Column("pipeline_run_id", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_transformation_log_pipeline_run_id",
        "transformation_log",
        ["pipeline_run_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_transformation_log_pipeline_run_id", table_name="transformation_log")
    op.drop_column("transformation_log", "pipeline_run_id")
