"""Migration 033: Backfill aei_task_snapshots.onet_soc_codes via the O*NET bridge.

`aei_task_snapshots.onet_soc_codes` (an ARRAY(Text) with a GIN index, added in
migration 002) was never populated by the ingest path, so it was 100% NULL across
all 16,976 loaded rows. Every consumer that keyed on it via `@> ARRAY[soc]`
containment therefore returned nothing silently:

  - occupations.py drift aggregate (now rewired to the direct O*NET bridge)
  - industry_profiles.py avg_automation / avg_augmentation / drift aggregates
    (four lateral joins) — these feed industry_occupation_profiles (US region)

The AEI source carries only task_text (the O*NET task description), never a SOC
column, so the array must be materialised from O*NET's own task -> onet_soc map.
This is a one-time backfill of already-loaded rows; the ingest service
(app/services/aei_temporal_ingestion.py::_populate_onet_soc_codes) runs the
identical UPDATE on every fresh rebuild so the column stays populated going
forward.

Codes are stored 6-digit (LEFT(onet_soc, 7), e.g. "15-1252") — the grain the
consumers key on (industry_profiles.py already substrings FROM 1 FOR 7). Only
NULL rows are filled, so no ingested measurement is overwritten (respecting the
AEI-snapshot immutability invariant). Rows whose task_text has no O*NET match
(~17%) correctly stay NULL.

Downgrade is intentionally a no-op: onet_soc_codes is derived enrichment, and
after a rebuild the ingest path repopulates it — blindly NULLing the column on
downgrade could discard ingest-written data we cannot distinguish from this
backfill.

Numbering: chains onto 032 (signal_source_registry), the current head.
"""

from alembic import op

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


# Kept identical to _POPULATE_ONET_SOC_CODES_SQL in the ingest service.
_BACKFILL_SQL = """
    UPDATE aei_task_snapshots ats
    SET onet_soc_codes = sub.codes
    FROM (
        SELECT lower(task) AS lt,
               array_agg(DISTINCT left(onet_soc, 7)) AS codes
        FROM onet_task_statements
        WHERE task IS NOT NULL AND onet_soc IS NOT NULL
        GROUP BY lower(task)
    ) sub
    WHERE lower(ats.task_text) = sub.lt
      AND ats.onet_soc_codes IS NULL
"""


def upgrade() -> None:
    op.execute(_BACKFILL_SQL)


def downgrade() -> None:
    # No-op: see module docstring. Reverting derived enrichment would risk
    # discarding ingest-written values indistinguishable from this backfill.
    pass
