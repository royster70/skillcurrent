"""Migration 030: drop the industry_occupation_profiles->O*NET foreign key.

Same 6-vs-8-digit mismatch as migration 029. `industry_occupation_profiles`
holds region-conventional occupation codes: **AU** rows carry 8-digit O*NET-SOC
(from `anzsco_soc_concordance`, valid against `onet_occupations`), but **US**
rows carry the **6-digit BLS SOC** straight from `oews_employment` (the US
compute prefix-joins O*NET only for the title). The FK to the 8-digit
`onet_occupations.onet_soc` therefore blocks the US profile insert on a clean
rebuild. Drop it — this derived analytics table keys occupations by a
region-conventional code, joined to O*NET by prefix where needed.
"""

from alembic import op

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "industry_occupation_profiles_onet_soc_fkey",
        "industry_occupation_profiles",
        type_="foreignkey",
    )


def downgrade() -> None:
    op.create_foreign_key(
        "industry_occupation_profiles_onet_soc_fkey",
        "industry_occupation_profiles",
        "onet_occupations",
        ["onet_soc"],
        ["onet_soc"],
    )
