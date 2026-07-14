# API Requirements Derived from Wireframe Rounds 1–9

Derived: 2026-07-13, from `Waterline Wireframes.dc.html` (turns 1–7) against the
current frontend API surface (`src/lib/api.ts`) and the Tier 1 brief.
Each requirement cites the wireframe option that created it (1a, 3b, 5a…).

Legend: ✅ exists today · 🔧 modify existing endpoint · 🆕 new work · 📦 CDN build artifact · 🗓 deferred

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

### 3.3 GDPval evaluations restore — 🗓 fill-later, NOT blocking (superseded by 4b.2/4b.3)
- `gdpval_evaluations` is 0 rows and fills later via a paid run. **Do NOT gate the
  build on it** (iteration-2 correction, verified 2026-07-14): the durable
  committed-CSV ingest is built and lab-agnostic, so scores drop in with no
  frontend change. Coverage is a two-state enum (4b.2), the scrubber's motion is
  labelled usage until scores land (4b.3), and the "capability rising" trendline
  is carried NOW by Epoch ECI (4b.4). This row remains only as the pointer to
  those; the earlier "design-blocking dependency" framing was wrong.

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

## 4b. Iteration 2 additions (turns 8–9, 2026-07-14)

Deltas from the open-source + API-readiness round. Field-by-field review
confirmed §1–§3 markings are accurate; these are additive.

### 4b.1 `/signals` payload grows provenance fields — 🔧 (extends §3.2)
Drivers: methodology source registry (8b), fingerprint "as of" hovers +
global vintage stamp (8d).
- Per signal: `version_key` (source vintage — e.g. `2024_science`, `28.1`),
  `vintage_date` (for the spread timeline), `licence`, `breadth`
  (occupations covered), `kind` (measured/theoretical), colour token.
- **Lead with `version_key`, never `ingested_at`** — pipeline-refresh dates
  falsely imply uniform currency (iteration-2 §B3).
- **Data-source note (verified 2026-07-14):** `version_key`/`vintage_date` come
  from `dataset_versions` (real DB), but **`licence` is NOT a DB field** — there
  is no licence column anywhere. It must be a **curated static mapping** (seed
  `signals.json` from `docs/data-sources.md`) until FR-9.5's
  `signal_source_registry` lands. Consistent with 4b.6 (static build-time), just
  don't expect to query it.
- Ships in `signals.json` for CDN; one source of truth for legend,
  registry table, and vintage stamp.

### 4b.2 GDPval coverage is TWO states, not a boolean — 🔧 (amends §2.1)
Driver: half-filled fingerprint dot + "benchmark defined, not yet measured"
panel (8d, 8e).
- `signal_coverage.gdpval` becomes `"scored" | "covered" | "none"`
  (all 44 benchmark occupations are `covered` today; `scored` after a paid
  eval run). Same enum in per-task coverage (§2.2).
- Detail payload includes `gdpval_benchmark_count` even when unscored, so
  the empty-state panel can say "30 benchmark tasks exist."

### 4b.3 Era-motion labelling — 🔧 naming fix (amends §2.5, brief §8.1)
`EraSnapshot.automation_potential` is rescaled AEI usage share in a
capability-named field. Until GDPval scores land:
- rename/alias to `usage_share_scaled` (keep old field deprecated), and
- add `motion_basis: "usage" | "capability"` so the UI labels the scrubber
  "share of real AI conversations", never "automation increasing."
UI swap to capability motion later = data + label only, no layout change.

### 4b.4 Epoch ECI trendline endpoint/export — ✅→📦 (small)
Driver: landing "rising waterline" animation (7a beat 1), group-tide module
(9c), worked-example progress spine (9a).
- Data is loaded (`gptval_benchmarks`, CC-BY, 6 Sonnet generations). Needs
  only a read endpoint or static `eci-trend.json` in the CDN export set
  (add to §4 list as item 8).

### 4b.5 Worked-example era series — 📦 (reuses §2.5, no new endpoint)
Driver: scroll-pinned role story (9a) + filmstrip fallback (9b).
- Needs per-era matrix snapshots for a **curated set of ~3 showcase roles**
  bundled into the landing/methodology page payload (not all 1,016).
  Export-time selection; full per-role history stays detail-view-only.

### 4b.6 Static/docs surfaces — no API
"How this works" (8b) and "Run this yourself" (8c) render from repo docs
(`docs/ARCHITECTURE.md`, `docs/data-sources.md`, ADR index) + `signals.json`.
Cite-this-page strings are build-time constants.

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
