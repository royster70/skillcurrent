"""Migration 029: drop the wrong OEWS->O*NET foreign key.

`oews_employment.onet_soc` holds a **6-digit BLS SOC** (e.g. '11-1011'), but the
original FK pointed at `onet_occupations.onet_soc`, which is an **8-digit
O*NET-SOC** (e.g. '11-1011.00'). The two can never match, so a clean rebuild
died at `ingest_oews` with a ForeignKeyViolationError.

The FK was always inconsistent with how OEWS is actually consumed: the US
industry-profile compute (app/services/industry_profiles.py) prefix-joins OEWS
to O*NET (`onet_occupations.onet_soc LIKE ow.onet_soc || '%'`), and Microsoft /
AEI join at 6-digit exact — the whole US ecosystem treats this column as a
6-digit SOC. So the correct fix is to drop the constraint; OEWS follows the same
6-digit convention as ms_ai_applicability_scores and aei_job_exposure (no FK,
prefix/exact join downstream).
"""

from alembic import op

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("oews_employment_onet_soc_fkey", "oews_employment", type_="foreignkey")


def downgrade() -> None:
    # Restore the (semantically wrong) FK for a faithful downgrade.
    op.create_foreign_key(
        "oews_employment_onet_soc_fkey",
        "oews_employment",
        "onet_occupations",
        ["onet_soc"],
        ["onet_soc"],
    )
