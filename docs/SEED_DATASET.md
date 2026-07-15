# Seed Dataset — clone and run without the full ingest pipeline

A committed, redistributable snapshot of the Tier-1 database under
`src/backend/data/seed/` — one Parquet file per table plus `manifest.json`.
It exists so a fresh clone can have a working database in minutes, without
running the full public-data ingestion pipeline (`docs/INGESTION_RUNBOOK.md`),
which needs several source downloads and takes much longer.

## Restoring it

```bash
cd src/backend
alembic upgrade head
python -m scripts.restore_seed
```

Add `--truncate` to re-run against a database that already has seed data in
it (clears the seed's own tables first — safe and idempotent; other tables
are untouched).

## What's in it, and what isn't

Every table is checked against `signal_source_registry` (FR-9.5) before
export — see `scripts/build_seed.py`'s `SEED_TABLES` mapping for the
table-to-source list, and `EXCLUDED_TABLES` for what's deliberately left out
and why (mainly: the three `vector` embedding tables, O*NET's bulkiest raw
detail tables, and the CompanyLookup/ASX tables). `manifest.json` records the
exact row/byte counts and the source licences actually shipped, generated at
build time — nothing is silently dropped.

This is the **tiny/committed tier** only (~240k rows, ~9 MB). A full CC-BY
snapshot as a GitHub Release asset is a separate, larger artifact — see
`ai_working/release-1.0-backlog.md` P2.

## Rebuilding it

```bash
cd src/backend
python -m scripts.build_seed
```

Requires a fully-ingested local database (`docs/INGESTION_RUNBOOK.md`) to
export from. Re-run this whenever the schema or the included tables change,
and commit the regenerated `data/seed/*.parquet` + `manifest.json`.

## Related

- `docs/PUBLISHING.md` — the redistribution gate this seed's table selection
  is checked against
- `docs/data-sources.md` — per-source licence detail
- `ai_working/release-1.0-backlog.md` — P2, the backlog item this implements
