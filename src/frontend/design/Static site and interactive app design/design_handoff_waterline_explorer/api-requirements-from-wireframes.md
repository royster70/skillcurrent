# API Requirements Derived from Wireframe Rounds 1–7

Derived: 2026-07-13, from `Waterline Wireframes.dc.html` (turns 1–7) against the
current frontend API surface (`src/lib/api.ts`) and the Tier 1 brief.
Each requirement cites the wireframe option that created it (1a, 3b, 5a…).

Legend: ✅ exists today · 🔧 modify existing endpoint · 🆕 new work · 📦 CDN build artifact · 🗓 deferred

---

## 0. Review correction (2026-07-13, verified against live code)

This delta was reviewed field-by-field against the real backend
(`app/api/v1/*.py`, `schemas.py`). **It is accurate** — every ✅ "exists today"
claim was confirmed against the actual code (matrix axes + `routine` quadrant,
`eloundou_median`/`eloundou_percentile`, `weighted_eloundou_beta`,
`/gdpval/occupations/{soc}`, subdivision endpoints all present as stated), and
every 🆕 was confirmed absent (`signal_coverage`, `evidence_tier`, `au_mapping`,
`/occupations/facets`, `/signals` — none exist anywhere in `api/v1/`). One
correction:

**🔧 HIGH PRIORITY — era_snapshots is NOT cleanly "already covered" (§1 row 4).**
`EraSnapshot.automation_potential` in `task_matrix.py` — the field the era
scrubber (turns 5a–5c) would animate — is computed as `min(task_pct / 5.0, 1.0)`:
AEI **usage share** rescaled by an arbitrary constant, stored in a field whose
name is indistinguishable from the current-era `automation_potential` (which IS
real Eloundou-beta capability). `drift_velocity` is the same trap (a linregress
slope over usage). Shipping the scrubber against this animates a usage number
dressed as capability — the exact conflation this whole project guards against.
**Fix required before the scrubber ships**: drop `automation_potential` from
`EraSnapshot`, or rename it (`usage_derived_estimate`) + mark heuristic so the
UI renders it dashed (brief §8 convention). This is the same class of issue §2.5
already flags for the raw `automation_pct`/`augmentation_pct` columns — it just
also applies to the *derived* field §1 treated as done. See brief §8.1.

**Also note (not a correction, a landscape update):** a 2026-07-13 datascout
scan confirmed no redistributable "capability × O*NET × longitudinal-panel"
source exists, so §3.3's GDPval restore stays the only path to real task-level
capability movement. One acquisition candidate surfaced — **GDPval-AA**
(Artificial Analysis's multi-model Elo leaderboard over the same GDPval
occupation set) — as a licence-permitting *complement* to the self-run restore.
See brief §8.3 before building anything era-scrubber-adjacent beyond the 44
GDPval occupations.

---

## 1. Already covered — no API work

| Wireframe decision | Endpoint | Notes |
|---|---|---|
| 3-box matrix axes (3a–3c) | ✅ `GET /occupations/{soc}/matrix` | `TaskMatrixPoint.automation_potential` (X) + `importance` (Y) are exactly LinkedIn's axes. |
| Zone/box terminology | ✅ same | Quadrant names `insulated / augmented / disrupted` already match LinkedIn's. |
| Draft-mark gauge (1a, 2a, 3a) | ✅ `GET /occupations/{soc}` | `eloundou_beta_*`, `eloundou_median`, `eloundou_percentile` cover marker + 0.27 tick. Scale constants (0–1.5) are client-side. |
| Era snapshots for scrubber (5a–5c) | ✅ matrix endpoint | `era_snapshots[]` per task + `available_eras`. |
| Usage column in task table (4a, 4b) | ✅ matrix endpoint | `aei_penetration` per task. |
| Facet slicers (1a browser) | ✅ `GET /occupations` | `sector`, `major_group`, `zone`, `classification` already combinable. |
| Waterline sector chart (1a, 7a, 7b) | ✅ `GET /sectors` | `weighted_eloundou_beta` per sector is the bar height input. |
| GDPval deep panel (6a) | ✅ `GET /gdpval/occupations/{soc}` | Rubric items, counts. |
| AU subdivision panels | ✅ `GET /sectors/{code}/subdivisions`, `matched_subdivisions` in classify | Per the sector-subdivision mockup spec — already in `api.ts`. |

## 2. Modify existing endpoints — new fields

### 2.1 Per-occupation signal coverage fingerprint — 🔧 HIGH PRIORITY
Driver: coverage fingerprint dots appear on **every** occupation row (1a, 1c, 4a, 4b)
and drive the adaptive detail layout (6a) and evidence tier chip (6b).

- Add to `OccupationSummary` (list) **and** `OccupationDetail`:
  ```json
  "signal_coverage": {
    "eloundou": true, "microsoft": true, "aei": true,
    "gdpval": false, "au_bridge": true
  },
  "evidence_tier": "full | partial | theoretical"
  ```
- `evidence_tier` must be computed server-side (one rule, one place) — the UI
  must not infer it from null-checking five fields per row.
- List endpoint needs it because the browser grid renders ~923 rows; a per-row
  detail call is not acceptable.

### 2.2 Per-task signal coverage + region weight — 🔧
Driver: task table columns (4a, 4b) show per-task fingerprint and weight;
AU mode relabels weight to "% of day".

- Add to `TaskMatrixPoint`:
  ```json
  "signal_coverage": { ...same shape... },
  "weight": 0.076,            // normalized within occupation
  "weight_basis": "importance_us | pct_time_au"
  ```
- Matrix endpoint gains `?region=US|AU` (it currently has no region param);
  AU response uses ASC `percent_of_time_spent_on_task` as the weight basis.
  Never blend the two constructs (brief §5.1).

### 2.3 Three-region membership — 🔧 (small)
Driver: 3-box geometry (3a–3c) replaces the current 4-quadrant model
(the `routine` quadrant folds into `disrupted`/`insulated` by the new boundaries).

- Either add `region3: "insulated | augmented | disrupted"` alongside the
  existing `quadrant`, or version the classification. Keep raw `x/y` in the
  payload so the boundary positions stay a design-tunable, not a data migration.

### 2.4 AU partial-mapping indicator — 🔧
Driver: brief §7 (43% of OSCA→ANZSCO correspondences are partial); the AU
browser and detail views need a "split mapping" mark.

- Add `au_mapping: "full | partial | none"` to `OccupationSummary`/`Detail`
  when `region=AU`.

### 2.5 Occupation-level era movement summary — 🔧
Driver: era scrubber default state + "back to current" (5a) and ghost compare (5c)
need, per occupation, per era: aggregate position deltas without loading the
full matrix history first.

- `OccupationDetail.aei_era_snapshots` exists; extend with per-era
  task-region counts:
  ```json
  "era_region_counts": [{ "model_era": "sonnet-4.5",
      "insulated": 2, "augmented": 9, "disrupted": 7 }]
  ```
- Label honestly: today this can only be driven by AEI `task_pct` (usage),
  since `automation_pct`/`augmentation_pct` exist only for sonnet-3.7
  (brief §8). API field names should say `usage_*` until GDPval restore lands.

## 3. New endpoints / new work

### 3.1 Facet counts for cross-narrowing slicers — 🆕
Driver: slicer options narrow to what's present (1a browser), empty-state
suggestions (brief §4).

- `GET /occupations/facets?sector=62&region=US` →
  ```json
  { "major_groups": [{"code":"29","count":70}, ...],
    "zones": {"E0": 51, "E1": 34, "E2": 8} }
  ```
- **CDN note:** in the static build this is computed client-side over the
  exported occupations table — the endpoint is full-build-only convenience.
  Decision needed: if client-side filtering ships anyway for CDN, consider
  making it the only implementation (one code path, per brief §6 seam logic).

### 3.2 Evidence-tier explainer payload — 🆕 (small, static)
Driver: 6b tier chip popover ("which signals exist and what each adds"),
7a beat 2, 7b primer cards.

- A static `GET /signals` (or bundled JSON): id, name, kind
  (theoretical/measured), breadth (occupations covered), depth description,
  color token. One source of truth for the five-instrument legend.

### 3.3 GDPval evaluations — 🗓 designed-for-absence, NOT blocking (build now, fill later)
- **Corrected framing (2026-07-14): do NOT gate the build on this.** `gdpval_evaluations`
  is 0 rows and fills later via a paid run; the design ships fully *without* it and the
  scores drop in with **no frontend change** through the committed-CSV ingest
  (`src/backend/data/gdpval_evaluations/` → `scripts/ingest_gdpval_evaluations.py`, wired
  into `run_pipeline` as an optional stage). Lab-agnostic — Claude and/or OpenAI eras are
  just additional `<era>.csv` files.
- **GDPval has TWO distinct states; do not collapse them to one boolean:**
  1. **Task-covered** — is this occupation *in* the GDPval benchmark set. **Known today**
     (44 occupations; `gdpval_tasks` + `gdpval_benchmark_count` loaded). The coverage-
     fingerprint GDPval dot is accurate NOW.
  2. **Scored** — do we have capability numbers for those tasks. **0 today**, fills after
     the run. Drives the GDPval capability panel (6a) and the era-scrubber's *task-level*
     movement (5b/5c).
  A "covered" occupation with no scores renders as "benchmark defined, not yet measured"
  (a first-class absence per 6a), NOT a fake zero and NOT a missing fingerprint dot.
- **The trendline itself does NOT depend on this.** The "capability rising over time"
  story ships now from **Epoch ECI** (`gptval_benchmarks`, loaded, CC-BY, 6 Sonnet
  generations). GDPval's role is *occupation-grounding* the trend, which is the fill-later
  enrichment — the MIT GDPval task set contains no scores, so it can't itself be a
  trendline (brief §8). Until scores land, the scrubber's task-level motion shows the
  usage-share proxy, honestly labeled (see §2.5 + the §0 `automation_potential` fix).

### 3.4 Propagated era movement (nearest-neighbor) — 🗓 deferred
- Extending GDPval movement to ~970 non-GDPval occupations via
  `onet_title_embeddings` NN bridge: **do not build an endpoint yet.**
  Wireframes only require that IF it ships, propagated points carry
  `"propagated": true` + confidence so the UI can render dashed/off-by-default
  (3c, brief §8 / ADR-011 pattern). Validate hold-out first.

### 3.5 Strategy B (independent DWA scoring) — 🗓 roadmap
- The matrix currently plots occupation-distributed fragments. Absolute
  task-level readings need Strategy B (brief §5.2). No API work now; schema
  above leaves room (`weight_basis` field generalizes).

## 4. CDN build artifacts — 📦 (build-time, not runtime API)

The wireframes confirm the brief's static-first plan. The export pipeline must emit:

1. **`occupations/{soc}.json` × 1,016** — detail payload **including** the new
   fields from §2 (coverage, tier, era summaries). The adaptive layout (6a/6b)
   must work offline from one file.
2. **`occupations/{soc}/matrix.json` × 1,016 × 2 regions** — new region param
   doubles this set; ~2,000 → ~4,000 files total with tasks. All small.
3. **`occupations.json`** — full list w/ coverage fingerprint per row (browser grid, facets, empty-state suggestions all client-side).
4. **`sectors.json`** (+ per-sector occupation lists) — waterline chart + drill-down.
5. **`signals.json`** — §3.2 legend.
6. **Search index** — bundled exact/prefix index (Fuse-style). The search box
   note ("exact-title matching in this build") is a UI string, not API.
7. **`stats.json`** — median β 0.27, p90 0.59, max 1.5, era list: landing
   beats (7a/7b) and gauge ticks read these rather than hardcoding.

Full-build-only (never exported, dead-code-eliminated via
`VITE_DEPLOYMENT_MODE`): `/search/semantic`, `/companies/classify`,
`/companies/search`, `/occupations/facets` (if §3.1 decision keeps it).

## 5. Decisions the API team needs from design (open)

1. **Region-3 boundaries** — where exactly the Insulated/right split and the
   Augmented/Disrupted split sit on the automation-potential and value axes
   (3a–3c show ~0.46 and ~0.55 as placeholders). One constant set, shared.
2. **Evidence-tier rule** — which signal combinations map to which tier (6b
   names: "fully surveyed" / "charted by bearing" / …). Proposal: gdpval ⇒ full;
   ≥2 measured signals ⇒ partial; eloundou-only ⇒ theoretical.
3. **Facet counts location** — server endpoint vs client-only (§3.1).
4. **Era scrubber scope** — detail views only (decided, turn 5); confirm the
   API never needs cross-era *sector* aggregates in v1 (7a beat-1 animation
   uses the existing Epoch ECI waterline series instead).
