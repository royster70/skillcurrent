---
date: 2026-07-17
status: accepted
agents: []
prd_section: FR-8.x
---

# Temporal Snapshot Layer — longitudinal history of derived readings

## Context

The platform's core insight is directional: AI capability is a rising waterline,
and the product's stated job is to track *where it sits today **and where it's
heading***. The second half needs history — a durable record of past readings to
diff against.

It didn't exist. Every derived "verdict" table is **recomputed in place** each
pipeline run:

- `task_drift_metrics` — `task_text` UNIQUE, bulk-insert into an empty table.
- `industry_occupation_profiles` — `DELETE WHERE (release_year, region)` then
  re-`INSERT`.
- `au_occupation_exposure` — `DELETE` all, then rebuild from `au_task`.
- The **US occupation β→zone** verdict has no table at all — it's derived on the
  fly in `occupations.py` from `eloundou_occ_scores`.

So a rerun overwrites the prior reading with no history kept, and prior readings
**cannot be reconstructed from the deployed static artifact** (it only carries
the latest). The delta feature ("what changed since last quarter/release",
GitHub #84) was therefore impossible — not for lack of a diff view, but for lack
of anything to diff. The gap is data, not UI.

An important subtlety surfaced during design: the E0/E1/E2 zone is defined on
the **static Eloundou β**, which has no per-era version. Only `aei_task_snapshots`
is temporal (4 model eras). So true period-over-period movement of the platform's
*own* zone verdict can only come from snapshotting that verdict over time — it is
not derivable from any existing temporal table.

## Decision

Add a **separate, append-only snapshot layer** that captures the derived
verdicts at each pipeline run, keyed by a temporal + provenance anchor. Mirror
the existing `aei_task_snapshots` append-only idiom; leave the live tables and
their clear-and-reload write paths completely untouched.

### Schema (migration 034)

- **`snapshot_runs`** — one row per capture: `as_of_date`, `captured_at`,
  `pipeline_run_id` (ties to `transformation_log`, ADR-007), `label` +
  `is_release`, `input_versions` JSONB (the `dataset_versions` that produced it,
  ADR-002), `onet_version`.
- **`exposure_snapshots`** — the compact per-entity verdicts, FK → `snapshot_runs`:
  `entity_type` ∈ {occupation, sector_occupation, task, au_occupation},
  `entity_key`, `region`, `beta`, `zone`, `drift_velocity`,
  `drift_classification`, `extra` JSONB (AU divergence/us-β/coverage). UNIQUE
  `(snapshot_run_id, entity_type, entity_key, region)`.

### Rejected alternatives

- **Make the live tables append-only.** Rejected: their natural-key UNIQUEs
  (`task_text`, the profiles composite, `osca_code`) and `DELETE`+`INSERT` write
  paths would all break, and every read endpoint would have to filter to "latest".
- **Full per-product history tables** (mirroring each wide derived schema).
  Rejected: ~3× storage, three diff paths, and the profiles table
  (NAICS×SOC×region) grows fastest. We snapshot only the verdicts we diff
  (Rule 5 — data dominates: capture the answer, not the whole worksheet).
- **Explicit-release-only capture.** Rejected: captures nothing between releases
  and needs a release/publish concept that doesn't exist. Instead: **capture
  every run** (never lose history), and let a run be *labelled* a release
  (`is_release`) so the UI can diff against the last release or the last run.

### Capture

A terminal, non-optional pipeline stage `snapshot_derived_products` (after every
derived stage) appends one snapshot per run, tagged with the active
`pipeline_run_id`. Also callable ad-hoc: `python -m scripts.capture_snapshot
[--label 2026-Q3 --release]`. Zones are computed on the single canonical
threshold set (E2 ≥ 0.85, E1 ≥ 0.40, else E0) — never re-derived.

Because capture is **server-side at recompute time**, the clock starts the day
this ships: every run not captured is history lost. This is why capture lands
first (this ADR) and the diff endpoints + `#84` UI follow once ≥2 snapshots exist.

## Consequences

- **Positive.** History accumulates from day one; "what changed" becomes a join
  between two `snapshot_runs`. Each reading is attributable to its input vintages
  (ADR-002) and its pipeline run (ADR-007). Hot path untouched.
- **Cost.** ~15.5k verdict rows per run (923 US + 960 AU occupations, 9,025
  sector-occupations, 4,605 tasks). Storage grows linearly with run count;
  acceptable for a weekly/quarterly cadence, revisit with a retention policy if
  runs become frequent.
- **Seed.** `snapshot_runs`/`exposure_snapshots` are added to `SEED_TABLES` so a
  genesis snapshot ships once regenerated (the seed regen rides with the PR that
  adds static delta emission). `restore_seed` reads the committed manifest, so
  the contract change is safe until then.
- **Provenance debt inherited (ADR-002).** Snapshots key to `dataset_versions`,
  which still lack per-row NOT-NULL version FKs on the derived tables and often
  a NULL `integrity_hash` — a snapshot is only as reproducible as its inputs are
  versioned. Not worsened here; flagged.

## Verification

Invariant tests (`tests/test_snapshots.py`, seeded-DB integration — the repo's
first append-only tests): capture counts equal the live source tables per
entity type; every captured zone agrees with the β thresholds (0 mismatches);
a second capture adds rows and never mutates the first (append-only), and the
two runs join cleanly for a diff. Verified against the live compose DB: genesis
capture wrote 15,513 verdict rows, zone-correct, provenance-stamped.
