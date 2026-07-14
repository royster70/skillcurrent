# signal_sources — the redistribution registry seed (FR-9.5)

`signals.csv` is the committed, human-curated source of truth for the
`signal_source_registry` table: **one row per external data source**, each
carrying a machine-readable `redistribution_ok` flag.

- **Ingest:** `python -m scripts.ingest_signal_sources` (hash-guarded; upserts on
  `source_key`, registers a `dataset_versions` row).
- **Pre-publish gate:** `python -m scripts.check_redistribution` validates *this
  CSV* (no DB needed) — it fails if a citation-only / view-only / unverified
  source is ever marked `redistribution_ok = true`, or if a known consumed-only
  source is missing or wrongly flagged.

## Columns
| Column | Meaning |
|---|---|
| `source_key` | stable slug (unique) |
| `source_name` · `publisher` · `dataset` | human identity |
| `licence` | e.g. `MIT`, `CC BY 4.0`, `Public domain`, `Citation-only` |
| `redistribution_ok` | `true` = may be bundled/exported/served; `false` = cite-only |
| `native_grain` | occupation / task / DWA / model-era / … |
| `source_url` · `status` · `notes` | provenance + context |

## Editing rules
- Keep in sync with `docs/data-sources.md` (the prose registry) and `NOTICE`.
  This file is intended to *replace* those as the enforcement source once the
  registry is wired into the seed/CI gates.
- A source is `redistribution_ok = true` **only** if its licence is
  CC BY / MIT / public-domain (or the project's own output). Anything
  citation-only, view-only, or licence-unverified is `false`.
- Adding a new source = one new row here + re-run the ingest. The
  `redistribution_ok = false` rows are load-bearing: they are the quarantine
  list the pre-publish check enforces.
