"""Migration 028: US-vs-AU occupation exposure divergence (FR-9.2).

Adds the US comparison to au_occupation_exposure so the headline "where
Australian work diverges from the US template" insight is queryable.

Both sides use the SAME per-DWA global exposure (AVG(dv_beta_derived)); they
differ only in TASK STRUCTURE and weights:
  - au_task_beta : AU tasks (ASC), weighted by percent_of_time (already present)
  - us_task_beta : US tasks (O*NET), weighted by task importance (IM rating)
so `divergence = us_task_beta - au_task_beta` isolates the effect of the AU vs
US task decomposition. Positive => US-structured work is more exposed than AU;
negative => AU work is more exposed.
"""

import sqlalchemy as sa
from alembic import op

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("au_occupation_exposure", sa.Column("us_task_beta", sa.Float(), nullable=True))
    op.add_column("au_occupation_exposure", sa.Column("divergence", sa.Float(), nullable=True))
    op.create_index("ix_au_occ_exposure_divergence", "au_occupation_exposure", ["divergence"])


def downgrade() -> None:
    op.drop_index("ix_au_occ_exposure_divergence", table_name="au_occupation_exposure")
    op.drop_column("au_occupation_exposure", "divergence")
    op.drop_column("au_occupation_exposure", "us_task_beta")
