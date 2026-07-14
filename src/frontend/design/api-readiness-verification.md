# Backend API-Readiness Verification — durable code-reality reference

**Read-only input for Claude Design; do NOT regenerate this file.** It lives
*outside* `design_handoff_waterline_explorer/` on purpose: that handoff is
Claude Design's *design intent* and gets fully regenerated each iteration (which
silently drops inline corrections — iteration 2 dropped a whole §0 review block).
This file is **code reality**, verified against the live backend, and persists.
**Where the two disagree on what is buildable, this file wins.**

Last verified: **2026-07-14**, against `src/backend/app/api/v1/*.py`,
`schemas.py`, and the live DB. Re-verify new handoff claims against code and
update *this* file each iteration — never rely on the regenerated doc's
self-asserted "field-by-field review confirmed."

## Verified — exists today (trust the ✅ markings)
Confirmed present in code: `/occupations/{soc}/matrix` (axes + `quadrant`
incl. `routine` + `era_snapshots` + `available_eras` + `gdpval_benchmark_count`);
`OccupationDetail.eloundou_beta_*` / `eloundou_median` / `eloundou_percentile`;
`SectorSummary.weighted_eloundou_beta`; `/gdpval/occupations/{soc}`;
`/sectors/{code}/subdivisions` + `matched_subdivisions`; `/occupations` facet
params (`sector`, `major_group`, `zone`, `classification`).

## Verified — genuinely NEW (not miscategorised)
None of these exist anywhere in `api/v1/`: `signal_coverage`, `evidence_tier`,
matrix `?region`, `region3`, `au_mapping`, `/occupations/facets`, `/signals`.

## Verified gotchas — the things that bite
1. **`EraSnapshot.automation_potential = min(task_pct/5.0, 1.0)` is rescaled AEI
   *usage*, not capability** — a real field named like a fake one. Never animate
   the scrubber's task motion as "automation" until GDPval scores exist. Also
   `drift_velocity` is a linregress slope over usage. (handoff 4b.3 fixes this.)
2. **`licence` per signal has NO DB column.** `version_key`/`vintage_date` come
   from `dataset_versions` (real), but licence is prose-only (`docs/data-sources.md`).
   `/signals` licence must be a curated static mapping until FR-9.5's
   `signal_source_registry` lands.
3. **GDPval is two states**: `covered` = 44 (via `gdpval_tasks`, known now),
   `scored` = 0 (via `gdpval_evaluations`, fills later via a paid run). Not a
   boolean. Fill-later, NOT build-blocking — the committed-CSV ingest is built.
4. **6-digit BLS SOC vs 8-digit O*NET-SOC**: US rows in `oews_employment` /
   `industry_occupation_profiles` key a 6-digit SOC, prefix-join to O*NET, NO FK
   (migrations 029/030 dropped them). Any `?region` work must respect this.
5. **Epoch ECI (`gptval_benchmarks`) is the loaded, CC-BY, *redistributable*
   capability trendline** — this is the "rising waterline over time" that ships
   now. GDPval-AA and OpenAI's GDPval leaderboard are **cite-only / not
   redistributable** (verified 2026-07-13/14); the MIT GDPval task set has no
   scores in it. So the trendline = Epoch; GDPval = occupation-grounding.
6. **DWA-level β fragments are occupation-distributed** (they sum to the
   occupation score; each is `occ_score × importance_weight`). NEVER
   zone-classify a fragment against the absolute 0.40/0.85 thresholds — relative
   rank within the occupation only (brief §5.2; Strategy B unbuilt).

## The 4 open decisions genuinely need design/product input (not code)
Region-3 boundary values; evidence-tier rule (signal combos → tier names);
facet-count location (server vs client — brief §6 CDN seam); confirm no cross-era
*sector* aggregates in v1 (the landing tide uses the Epoch series).
