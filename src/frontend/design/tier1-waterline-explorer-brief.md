# Tier 1 "Waterline" Explorer — Design Brief for Claude Design / Fable

Created: 2026-07-13
Status: Direction-setting brief, pre-visual-design. Written after a working prototype
(interactive HTML concept, "Waterline") validated the core metaphor and several
chart forms. This document is the handoff — self-contained, no prior context assumed.

## 1. What this is

A ground-up reconsideration of how Tier 1 (public Industry Intelligence — no HRIS,
no org data, no privacy controls needed) presents AI task-exposure data: the mapping
of roles → tasks → AI propensity, the honest communication of *coverage* (some
signals are measured deeply across few occupations, others thinly across many), and
US/AU regional divergence. Tier 2 (org overlay, privacy-gated) is explicitly out of
scope for this brief.

The platform's own stated core insight — "AI capability follows a compounding,
directional trajectory, a rising waterline across task landscapes" — is not
currently expressed visually anywhere in the app. This brief proposes making that
metaphor the literal visual and interaction language of the explorer, not just a
line in the docs.

## 2. The core metaphor: a hydrographic survey chart

Not a generic AI dashboard (no purple-blue gradient hero, no Inter-everywhere, no
card-grid-with-icons). The visual system is a **nautical/hydrographic survey
chart**: bathymetric depth blues, chart-cartouche typography, brass instrument
accents, soundings and draft marks as real data-bearing marks, not decoration.
Every visual device below is chosen because it maps 1:1 onto something the data
actually means — that discipline should hold for anything added later too.

### Validated palette (computed against WCAG contrast, OKLCH chroma floor, and
Machado-2009 CVD-deficiency simulation — not eyeballed)

**Light mode**
```
--ground:  #f2f6f5   --surface: #ffffff   --ink: #0e1f27
--accent (brass): #9c6414
--zone-e0 (dry ground / Human):    #b06a1a
--zone-e1 (waterline / Augment):   #146f9e
--zone-e2 (submerged / Automate):  #0d8f6e
--sig-eloundou (theoretical):  #a02f5c
--sig-microsoft (applicability): #1f6fd6
--sig-aei (usage):             #0e9a72
--sig-gdpval (capability):     #9c3f14
--sig-jsa (AU structural):     #4a9440
```

**Dark mode**
```
--ground:  #071019   --surface: #0f1e29   --ink: #e7f1ef
--accent (brass): #e3a344
--zone-e0: #b5793a   --zone-e1: #3f8fc2   --zone-e2: #3fa98d
--sig-eloundou: #c93f70  --sig-microsoft: #3987e5  --sig-aei: #2aad82
--sig-gdpval: #d65f2e    --sig-jsa: #4a9e3f
```
Zone colors reuse the platform's existing E0/E1/E2 system (CLAUDE.md) — do not
invent new thresholds; Beta zones stay E2 ≥ 0.85, E1 0.40–0.85, E0 < 0.40.

### Typography
- Display / cartouche headings: Georgia (serif — chart title-block convention)
- Body / UI: "Segoe UI"-led geometric sans
- Data / numerals ("soundings"): Consolas-led monospace, `tabular-nums`
No custom font embedding (Artifact/CDN CSP constraints) — system stacks only.

## 3. Key visual devices (each grounded in a real nautical/data concept)

1. **The Waterline chart** (top-level, sector view) — bar-per-sector, height =
   `1 − average β`, split by a horizontal reference-datum line. This is the
   platform's metaphor made literal: sectors "underwater" are automation-heavy.
   *Already prototyped and works.*

2. **Signal Soundings chart** — answers "which signals are deep vs wide." X =
   breadth (occupations reached, log scale), Y = depth (evidence per reading,
   drawn downward from a surface line, like a lead-line sounding). GDPval:
   short-x/long-drop (44 occ, 10,453 rubric items). Eloundou: long-x/short-drop
   (923 occ, one score each). *Already prototyped and works.*

3. **Density-progression backdrop** — NOT different images per drill-down level.
   Same instrument system throughout; contour lines and soundings get *denser* as
   you go sector → occupation → task, because that's literally true (finer
   measurement grain at each level). Cheap (CSS gradient/pattern density), no new
   image assets, stays coherent.

4. **Seabed-composition hatching per sector** — real Admiralty-chart convention
   (S/M/R/Wd = sand/mud/rock/weed, used to show what's on the seabed) repurposed
   as a subtle per-sector background texture for wayfinding. Deliberately chosen
   over literal industry photography/iconography, which risks stock-clipart
   cliché and fights the instrument-chart coherence.

5. **Signal icons, grounded in what each signal *is*, not decorative shapes**:
   - Eloundou (theoretical, calculated not measured) → compass/bearing mark
   - Microsoft (a live applicability reading) → dial/gauge
   - AEI (usage across many conversations) → tally / activity waveform
   - GDPval (rubric-graded) → checklist mark
   - AU/ASC bridge (structural bridge between coordinate systems) → bridge/link glyph

6. **Coverage fingerprint** — a compact row of 5 small marks (one per signal,
   using the colors above) next to every occupation and task row: filled if that
   signal covers this row, hollow if not. Distributes the coverage-honesty story
   onto every row instead of centralizing it in one chart.

7. **Ship's draft-mark gauge** — see §5.2, the resolution to the absolute-vs-relative
   exposure problem.

8. **Morph / FLIP transitions between drill-down states** — enabled by static
   data being fully prefetchable (see §6): clicking a sector bar should visually
   morph that element into the occupation list, not swap pages. Object constancy,
   not spinner-then-new-page. This is where the *most* meaningful use of motion
   in the whole app lives: a task card **sliding between Human/Augment/Automate
   columns** when toggling US⇄AU region (or, once available, between model eras)
   is a stronger signal of divergence than numbers merely changing underneath you.

9. **Occupation tile grid — a periodic-table *aesthetic*, deliberately not a
   periodic-table *structure*.** Considered and rejected: a literal grid with
   sector on one axis and job-family (SOC major group) on the other. The
   periodic table's power comes from both axes being intrinsically, continuously
   ordered, with adjacency carrying real predictive meaning (neighbors behave
   similarly) — verified this doesn't transfer here:
   - Neither sector nor major-group has a real ordering (both are category
     lists, not continuums like atomic number).
   - The grid would be sparse and clumpy, not dense — Healthcare alone touches
     only ~10 of 23 major groups (§4), so most of a ~460-cell sector×family grid
     sits empty.
   - Adjacency is only meaningful on *one* axis: two occupations in the same
     job-family-column across different sectors likely share real task
     structure (Software Developer in Finance vs. Healthcare); two occupations
     in the same sector-row but different families usually share nothing (a
     hospital's Transportation role next to its Healthcare Practitioner role).
     Half the table's implicit "neighbors relate" promise would be broken.
   **What to build instead**: keep the tile *aesthetic* (small square,
   abbreviation, category-color) that makes the periodic table a satisfying
   browse device, dropped onto a structure that's actually true — a grid of all
   ~923 occupations grouped by job family (one real, legitimate grouping),
   colored by zone (E0/E1/E2), sized or ordered by employment or β within each
   family cluster. Effectively a treemap / faceted small-multiples grid wearing
   element-card styling, not a dual-axis periodic table. Note: the Signal
   Soundings chart (#2) *is* the one place in this domain with the periodic
   table's real structural DNA — two independent, continuously-ordered,
   position-predicts-meaning axes (breadth × depth) — so that's the legitimate
   home for a "read the position" chart, not the occupation browser.

**Explicitly avoid**: literal 3D/WebGL rendering, and a literal sector×job-family
periodic table (#9). Both charts in #1–2 are fundamentally 2D-precision problems
(magnitude/position beats 3D depth as a perceptual channel for reading exact
values); the task hierarchy is a tree, which reads faster and more accessibly in
2D (indented/treemap) than as a 3D fly-through. 3D also raises the device/GPU
floor right as the publishing architecture (§6) is optimizing to reach the
widest possible audience cheaply. Reserve dimensionality cues for the 2D
parallax/density technique in #3. The periodic table caution is the same class
of mistake as 3D: borrowing a metaphor's familiar *form* without checking
whether the data actually has the structural properties that form promises.

## 4. Information architecture: facets, not a forced tree

**Checked against the real schema — industry and job-family are NOT a nested
hierarchy, they cross.** Computer & Mathematical occupations (SOC major group 15-)
appear meaningfully across 8+ sectors (~20 occupations each in Professional/Tech,
Education, Government, Healthcare, Manufacturing, Finance...). Healthcare (sector
62) pulls occupations from 10+ different major groups (70 from Healthcare
Practitioners, but also 46 Office/Admin, 34 Management, 28 Business/Financial, 25
Life/Physical Science, 22 Transportation). 23 SOC major groups total — a real,
complete, standard taxonomy, not something to invent.

**Design consequence: use independent, combinable slicers, not a forced
Industry → Job Family → Job breadcrumb.** A forced linear path would misrepresent
data that's actually a matrix. The backend already works this way —
`GET /occupations` already accepts `sector`, `major_group`, `zone`, and drift
`classification` as independent, combinable query params. This is a UI gap, not
new backend work.

Recommended interaction:
- **Sector is the default primary lens** (matches the Waterline chart, matches
  how people naturally think — "show me Healthcare").
- **Job family (major group) and zone are secondary, progressively disclosed**
  refine-further chips — shown only once a sector is engaged, not all controls
  thrown at the user on first load.
- **Each slicer's available options narrow to what's actually present in the
  current selection** (picking Healthcare shows only the ~10 major groups
  genuinely present there, not all 23) — real cross-filtering, not decorative.
- **Design the empty state deliberately.** A narrow facet combination can
  legitimately return zero results; suggest the nearest non-empty combination
  rather than showing a blank grid.
- The specific occupation, once selected via slicers, is where §5 takes over.

## 5. Occupation detail: two complementary, honestly-distinguished views

### 5.1 The DWA/task grid (relative, within-occupation)
A 3-column board — **Human / Augment / Automate** (plain operational language
here, distinct from the Waterline chart's nautical framing — same three colors
and same E0/E1/E2 zones underneath, cross-referenced, not a rebrand). Real DWA
density supports this: US occupations average **~20 DWAs each** (range 5–41), AU
averages **~21** (range 5–224 — cap/sort by weight for the long tail). Each card
sized by weight and sorted within its column, largest first.

**Weight field differs by region — label it, don't blend it**: US uses O*NET task
Importance rating (`onet_task_ratings`, scale IM); AU uses ASC's actual
`percent_of_time_spent_on_task`. Different constructs (importance-to-the-job vs.
share-of-your-day) — both legitimate, not interchangeable, must stay visibly
distinct per-region.

### 5.2 The critical finding: DWA-level scores are NOT independently comparable
to absolute zone thresholds

**Verified against real data, not assumed.** Software Developers' *occupation*-level
Eloundou β = **1.224** (deep in automated territory — matches the intuition that
this role is heavily AI-impacted). But each of its 18 DWAs is derived as
`occupation_score × normalized_importance_weight`, where weights sum to exactly
1.0 across the occupation's DWAs (verified: 18 fragments sum to 1.2237, matching
to the decimal). Even the single largest-weighted DWA comes out to only **β ≈
0.17** — nowhere near the 0.40 threshold — purely because it's one slice of an
18-way split, not because that activity is genuinely low-exposure.

**Consequence: do not zone-classify individual DWA fragments against the
absolute 0.40/0.85 thresholds.** Doing so would make nearly every task in nearly
every occupation read as "Human," regardless of true occupation-level exposure —
actively misleading, not just imprecise.

**Resolution — build both, together, not either/or:**
1. **The DWA grid (§5.1) uses *relative* ranking** — which activities carry the
   most weight toward this occupation's exposure — never an absolute-threshold
   zone claim per fragment.
2. **A persistent "draft-mark" gauge shows the *absolute* occupation-level
   reading**, on a fixed scale identical across every occupation you ever view.
   Real ships have painted draft marks on the hull showing exactly how deep the
   vessel sits below the waterline — a graduated scale that never moves, legible
   from a distance regardless of which ship or which day. Same device here: a
   small vertical gauge, graduated **0 to 1.5** (β's true mathematical ceiling —
   E1 + 0.5×E2, both capped at 1.0, confirmed against real data: max observed is
   exactly 1.5, held by Mathematicians), zone-banded in the same E0/E1/E2 colors,
   with a marker at the current occupation's β. **The scale is the constant —
   only the marker moves as you navigate between occupations.**
   - Use a **linear** scale, not log — even though most occupations cluster low
     (median β = 0.27, p90 = only 0.59 across all 923 scored occupations) and a
     linear scale will visually compress most roles into the lower third. That
     clustering is the true picture, not a flaw to compress away — it's *why*
     the 0.40 threshold sits just above the median and 0.85 is genuinely rare.
   - Add a small fixed tick at **β = 0.27** marking "typical role" on every
     gauge — free context once you know the real median.

**Future, not now**: CLAUDE.md documents a second derivation approach,
**"Strategy B (LLM rubric)"** — independently judging each DWA's automatability
on its own terms rather than distributing a pre-existing occupation score. This
was never built; only the distributive "Strategy A" shipped. Strategy B is the
real fix for wanting absolute, independently-measured DWA-level numbers. Flag as
roadmap, not a blocker for this brief.

## 6. Publishing architecture: CDN-first, feature-flagged

Given Tier 1 is public-data-only (no privacy controls per CLAUDE.md), the
cheapest and lowest-hardening-burden path is **static-first, not a live public
backend**: pre-render pipeline output to JSON at build time, serve off a CDN
(Cloudflare Pages / GitHub Pages — near-free). A CDN serving static files has no
query surface to abuse, no DB to protect, no compute to rate-limit — the
hardening question mostly evaporates.

**What survives static export cleanly** — checked against actual endpoint
signatures, not assumed:
- `GET /occupations/{soc}` and `/{soc}/tasks` — keyed *only* by SOC code, no
  filters. Pure lookup over a known, finite set (1,016 codes). Pre-render all
  1,016 × 2 ≈ 2,000 JSON files. **Full occupation and task depth survives
  entirely** — same payload the live API would return, not a degraded version.
- `GET /occupations` (list, with filters) — export the whole ~1,000-row table
  once, filter/paginate client-side. Small enough to do in-browser.
- `GET /sectors/{code}/composite` (arbitrary sector-code combinations) —
  combinatorially too large to pre-render, but the blending is pure aggregation
  math over already-exported facts — portable to a client-side calculation, no
  server needed.

**What genuinely doesn't survive** — the *entry points* into the data, not the
depth once inside it:
- `GET /search?q=...` — free text, unbounded. Either drop, or ship a small
  bundled client-side index (Fuse.js-style, exact/prefix matching only — a real,
  smaller capability than server-side fuzzy match, not equivalent).
- `GET /search/semantic` — pgvector embedding similarity on arbitrary query
  text. Cannot be statically exported; needs a live vector index.

**Feature-flag mechanism**: Vite build-time env var
(`VITE_DEPLOYMENT_MODE=cdn|full`), not a runtime toggle (that's what `region`
already is — a different, per-request concept). Vite dead-code-eliminates
branches guarded by `import.meta.env.VITE_*` at build time, so the CDN bundle
doesn't just hide the LLM company-classify feature, it never ships the code path
to it — no client-side route to the Anthropic-backed endpoint even exists in that
build. Two concrete, cheap seams already in the codebase make this low-cost to
implement:
- `src/frontend/src/lib/api.ts` — every API call funnels through one `get<T>()`
  function (line 5). CDN mode swaps that one function's implementation (fetch
  static JSON instead of a live server); every call site and type is untouched.
- `CompanyLookup.tsx` is already an isolated component, not inlined —
  `{import.meta.env.VITE_DEPLOYMENT_MODE === 'full' && <CompanyLookup />}`
  removes it cleanly.

**UI honesty**: don't badge the whole CDN build as "lite" — most of the app
(every occupation, every task, sector pages) is byte-identical to the full
build. Scope the "this build is narrower" signal to exactly where it's true: a
small note near the search box ("exact-title matching only in this build — [link]
for fuzzy & semantic search") and near the composite-sector picker if its
client-side math turns out limited.

## 7. Regional divergence — known crosswalk realities to design for

The US↔AU comparison (region toggle) rests on real crosswalk machinery with
**known, bounded, non-trivial confidence gradients** — checked, not assumed:
- The semantic DWA↔ASC bridge (`dwa_asc_bridge`, the mechanism underlying all AU
  task-level exposure) has confidence min 0.60 (the documented floor), **median
  0.78, mean 0.80** — most matches are comfortably confident, only the bottom
  quartile sits near the floor. Reassuring, not alarming.
- OSCA→ANZSCO occupation correspondence is **791 "full" (57%) vs 592 "partial"
  (43%)** — a real, sizeable minority of non-1:1 mappings. The slicer/navigation
  UI for AU should handle split/partial correspondence gracefully (a visual
  "split mapping" indicator), not assume every AU occupation maps cleanly 1:1.
- ~55 of 1,016 US occupations have no sector mapping at all (consistent with
  CLAUDE.md's documented "All Other"/military SOC-55 exclusions — expected, not
  a new gap).

## 8. Cross-model-era movement — what's real today vs. what's a dependency

The idea of task cards visibly migrating across the Human/Augment/Automate grid
as new model generations arrive is compelling but only partially deliverable
with currently-loaded data:
- **Real today**: the Waterline chart's reference-datum line can genuinely
  animate using Epoch ECI's 464 real benchmark-velocity rows (loaded, `/gdpval/waterline`).
  The aggregate "tide is rising" story is true and available now.
- **Real but a different claim**: AEI's `task_pct` (usage share) is populated
  across all 4 real model eras (sonnet-3.5 → 3.7 → 4 → 4.5) and could show
  tasks gaining attention over time — but checked: `automation_pct` /
  `augmentation_pct` are populated *only* for the sonnet-3.7 era, NULL
  everywhere else. There is no real automation/augmentation trend in the loaded
  data today. If usage-share trend is used, label it plainly as "usage rising,"
  not "automation increasing" — different constructs, don't conflate.
- **The actual thing this idea pictures — task-level capability reclassification
  across model eras — depends on `gdpval_evaluations`, currently 0 rows. The
  restore is committed** (2 Sonnet-generation evaluations, ~$16, already
  scoped) — **design for its presence, not its absence.** Once it lands, the
  44 GDPval-covered occupations get real, measured capability movement (not a
  usage-share proxy) on the era scrubber (§3.8, wireframe turns 5a–5c); every
  other occupation still shows usage-share movement only, honestly labeled.
  **Concrete backend requirement this surfaces**: the restore script must
  register a `dataset_versions` row for `gdpval_evaluations` on completion,
  following the same ADR-002 pattern every other ingest already uses (see §11
  provenance mechanism) — otherwise the freshness/vintage stamp has nothing to
  show for it once populated, and the coverage fingerprint would have no
  "as of" date to attach to a newly-solid GDPval dot.
- **Extending narrow-deep GDPval movement to the wider ~970 non-GDPval
  occupations is possible but must follow the platform's existing tiered-confidence
  pattern (ADR-011), not a new ad-hoc mechanism.** Infrastructure already exists:
  all 44 GDPval occupations are SOC-anchored, and `onet_title_embeddings`
  (66,512 rows) covers all 1,016 O*NET occupations including all 44 GDPval ones
  — a nearest-neighbor bridge is buildable today. Propagate the *capability
  delta* (trend shape), not an absolute score. Validate first: hold out a known
  GDPval occupation, check whether its nearest-neighbor's trend would have
  predicted its real trend. **Any propagated/extrapolated movement must render
  visibly differently** from real GDPval-measured movement (dashed border, lower
  opacity, explicit confidence label) and must be **opt-in, off by default** —
  same convention as the platform's existing T3a/T3b derived-tier marks.

### 8.1 A SHIPPED BUG the era scrubber must not build on

Verified in `app/api/v1/task_matrix.py`: `EraSnapshot.automation_potential`
(the field wireframe turns 5a–5c would animate) is **not derived from any
automation measurement**. Its actual formula is `min(task_pct / 5.0, 1.0)` —
AEI *usage share* rescaled by an arbitrary constant (5% usage ⇒ "fully
automated"), stored in a field whose name is indistinguishable from the
*current*-era `automation_potential` a few lines up, which IS properly computed
from Eloundou DWA-beta exposure. One field is a real measurement; the
same-named field one JSON layer down is a rescaled usage heuristic, unmarked.
`drift_velocity` has the same trap — it's a linregress slope over `task_pct`
(the service docstring says "positive = increasing AI usage"), not capability.
**Fix before the scrubber ships**: stop populating `automation_potential`
inside `EraSnapshot`, or rename it (`usage_derived_estimate`) and mark it
heuristic so the frontend renders it dashed per the §8 convention — do not let
the scrubber animate a usage-share number dressed as capability. (Logged as its
own high-priority item against the API-requirements doc's §1, which had
miscategorised era_snapshots as "already covered, no work.")

### 8.2 Considered and rejected: scaling Epoch's aggregate growth onto tasks

Tempting shortcut: multiply each task's static Eloundou exposure by Epoch ECI's
aggregate capability-growth rate to fabricate per-task era movement. **Rejected
— it assumes every task benefits from model improvement at the same uniform
rate** (a coding task and a customer-service task do not move together), and
`gptval_benchmarks` has *zero* linkage to O*NET tasks/DWAs (verified: no
soc/task columns), so there is no honest per-task coupling to lean on. This
would manufacture exactly the false task-level precision the wireframes'
uncertainty-ellipse (turn 6c) exists to prevent. **The defensible academic
precedent is AIOE-style ability-grain propagation** (Felten/Raj/Seamans map
*which* benchmark capabilities relate to *which* O*NET abilities, so growth is
capability-specific, not uniform) — coarser than task grain and therefore
honest, but AIOE is citation-only/non-redistributable and only sparsely
updated. Do not propose task-grain Epoch scaling again without reading this.

### 8.3 External-landscape scan (datascout, 2026-07-13) — what's acquirable

A web-research pass confirmed the negative: **no redistributable source
provides evaluated-capability × native-O*NET × a designed longitudinal panel.**
The field converges on rubric-graded economic-task evals with re-runnable
leaderboards. Decision-relevant finds:
- **GDPval-AA (Artificial Analysis)** — a third-party leaderboard running
  OpenAI's *exact* GDPval gold set across ~150 models, continuously updated,
  Elo-anchored to a human=1000 baseline: a multi-generation capability
  trajectory over the **same 44 occupations the platform already crosswalks to
  O*NET**. **LICENCE VERIFIED (2026-07-13, from AA's own pricing/data-API
  pages): NOT openly licensed — free tier is internal-use-only, no
  redistribution; redistribution requires a paid commercial arrangement
  ("For data redistribution or external use, contact us"). `redistribution_ok
  = false`.** Do NOT conflate with the underlying GDPval *task set* (OpenAI,
  MIT, redistributable — already held); it is AA's *Elo scores* that are gated.
  Under the FR-9.5 open-source gate, this **cannot be exported into the CDN
  static bundle or any published output.** Legitimate uses: a **cited outbound
  link** to the live leaderboard (citation needs no licence), or a **paid
  commercial feed in the full build only** — never the free CDN export.
  Net: GDPval-AA does NOT rescue the era-scrubber for the open-source product;
  the committed self-run `gdpval_evaluations` restore stays the only
  *redistributable* task-level capability signal (you generate it, so its
  licence is yours to publish). Also Elo (relative) not absolute-%, and
  leaderboard-not-panel (release-date drift, ADR-007 Phase-3 Rule 4).
- **OpenAI first-party GDPval leaderboard + public grader (verified 2026-07-14)**
  — distinct from the third-party GDPval-AA above, and a cleaner position. Three
  separate licences: (1) the **gold task set** (`openai/gdpval` on HuggingFace,
  93k downloads) is **MIT — redistributable, already held** (this is what the
  platform loaded); (2) OpenAI runs a **public automated grader** at
  `evals.openai.com` explicitly "so other researchers can build on this work" —
  so *external* model outputs (i.e. Claude's GDPval deliverables) can be graded
  by OpenAI's official grader (exact API access/cost terms unconfirmed — check
  at use-time); (3) OpenAI's **leaderboard scores** (GPT-5.x trajectory) are
  likely view-only, but **not needed** — MIT tasks + public grader means you can
  *generate your own* scores rather than depend on OpenAI's computed numbers.
  **Strategic effect: the self-run is the CLEAN path, not a fallback** — every
  input is open (MIT tasks) or yours (your model outputs), so unlike GDPval-AA
  there is no cite-only dependency. Cross-lab is a drop-in: the committed dataset
  (`src/backend/data/gdpval_evaluations/`) is keyed by `model_era` with no vendor
  assumption, so OpenAI-model eras become their own `<era>.csv` files via the same
  ingest. Optional methodology upgrade: grade the Claude self-run with OpenAI's
  public grader instead of the local Haiku judge — more comparable to the
  official leaderboard and drops the ~$3.14/era judge cost; tradeoff is sending
  Claude outputs to OpenAI. Bonus: a *third-party* `lshx90/gdpval-gpt5` HF
  dataset of GPT-5 GDPval results exists — unofficial, licence-unknown; verify
  before any use, default don't-ingest.
- **UMich `open-econ-index`** (arXiv 2606.26118) — the only new effort native
  to O*NET v30.1's full DWA hierarchy (adoption + capability), but no
  longitudinal panel yet and licence literally "TBD". **Monitor, do not depend
  on.**
- **AEI newer releases** (Economic Primitives, Learning Curves; CC-BY, same HF
  repo already ingested) — fresher temporal *usage* data, cleanly ingestable
  now if a fresher AEI cut is wanted. Still usage, not capability.
- **ILO WP140** — genuinely *repeated* exposure index (2023 → 2025 → 2026),
  ISCO-08-keyed; reachable for the **AU side via the existing OSCA↔ISCO-08
  correspondence** as an FR-9.5 registry signal. Exposure not capability, but a
  real repeated measurement.
Net: the era-scrubber's honest form above is now externally validated as the
state of the art, not a compromise. The one worthwhile new acquisition is
GDPval-AA (licence permitting).

## 9. Open questions for the design session (intentionally not pre-decided)

- Exact visual treatment of the draft-mark gauge (orientation, size, placement
  relative to the DWA grid) — sketched conceptually in §5.2, not pixel-specified.
- Whether the seabed-hatch sector textures (§3.4) read well at UI scale without
  becoming visual noise — needs an actual rendering pass to judge.
- Full icon set for all 5 signals (§3.5) — only the semantic direction is fixed,
  not final glyphs.
- Whether/how the empty-facet-state (§4) surfaces a "nearest non-empty
  combination" suggestion.
- Whether the occupation tile grid (§3.9) actually scans well at real scale
  (~923 tiles, grouped into 23 uneven-sized family clusters) — the structural
  reasoning against a literal periodic table is settled, but the *replacement*
  (grouped tile grid) is reasoned from principle, not yet seen. Worth an actual
  rendering pass before committing: does grouping by family produce clusters
  that read as coherent regions, or does the size imbalance (§4: some families
  have 70+ occupations, others far fewer) make it feel lopsided rather than
  scannable? A goal to explore, not a decided layout.

## 10. Reference prototype

An interactive HTML concept ("Waterline") exists validating: the Waterline
sector chart, the Signal Soundings chart (breadth × depth), sector/occupation
drill-down with a US⇄AU region toggle, and a generated (illustrative, not real
DWA-level) task table. Built and tested in-session — palette validated via
computed CVD/contrast checks, theme-reactivity verified, layout geometry
verified (no overflow, no overlap). Available as a Claude Artifact in the
session that produced this brief; treat its specific numbers/mock data as
illustrative only — all the *real* figures in this brief (DWA counts, β
distributions, crosswalk confidence) come from live queries against the actual
loaded database, not the prototype's placeholder data.

## 11. Open-source audience — discoverability and provenance

Written after the wireframe-phase handoff (turns 1–7, in
`Static site and interactive app design/design_handoff_waterline_explorer/`)
surfaced an audience gap: that work was designed against "HR/business leaders
arriving with a question" (wireframe turn 7c's stated framing, implicit in
7a/7b too). That's the wrong primary audience for a project heading
open-source, not staying a consulting product. Real open-source visitors split
into at least four groups wanting genuinely different things: **contributors**
(the data model, extension points — the FR-9.5 pluggable signal registry),
**researchers/citers** (derivation methodology, confidence tiers, before
they'll trust a number), **self-hosters** (a "run this yourself" path — ties
directly to the seed-dataset/docker-compose/bootstrap workstream already on
the roadmap, and currently has no discoverable entry point anywhere in the
wireframes), and **casual visitors** arriving from a link, genuinely closer to
turn 7c's rejected "browsing mood" than 7a/7b's "fastest to data" instinct.

**Resolution: insights still lead — this doesn't reopen the landing-pattern
decision.** The waterline stays the visual front door (turns 7a/7b, not 7c).
What changes is that "how do we know this" needs to be a first-class,
substantially-written destination — not the glossary-depth link 7b currently
sketches — seeded from content that already exists as developer-facing repo
docs (`docs/ARCHITECTURE.md`, `docs/data-sources.md` for licenses/attribution,
the ADR index) but that no site visitor would ever find today. And a "run this
yourself" path needs a real, visible entry point, not an assumption someone
will find the README.

### Provenance mechanism (extends the coverage fingerprint, §3.6 — not a new device)

Checked the real `dataset_versions` table rather than design this from
assumption. Two dates exist per dataset and they mean different things —
conflating them would repeat the exact signal-conflation mistake flagged
throughout this brief:
- **`version_key`** — the actual *source* vintage (`eloundou: 2024_science`,
  `onet: 28.1`, `microsoft_working_with_ai: 2025-07`, `oews: 2024`). This is
  what a researcher or citer actually needs — Eloundou's score is still
  fundamentally 2024 research no matter when it was last re-ingested.
- **`ingested_at`** — when the *local copy* was last refreshed. Right now
  nearly everything shows the same ingest date because that's when this
  environment was last rebuilt — displaying that as "last updated" would
  falsely imply uniform currency across signals with wildly different real
  cadences (Eloundou frozen since 2024; Epoch ECI's `version_key` genuinely
  *is* close to a real date because it's a runtime-downloaded feed that grows
  with upstream, documented as "≥408, treat as a floor").

**Lead with `version_key` (source vintage); keep `ingested_at` as a secondary
detail.** Mechanism: no new UI surface — extend the already-decided coverage
fingerprint (§3.6) so each of the five signal dots carries "as of
[version_key]" on hover/click, alongside the existing filled/hollow
covers-this-row state. Pair with a compact, always-visible vintage stamp near
the top of the primary view — wireframe direction 1c already sketched exactly
this ("DATA v2026.06 · 1,016 SOC · 5 SIGNALS"); elevate it from one
direction's incidental detail to a requirement across whichever direction
wins, and make it show the real spread of vintages rather than implying one
blanket date covers all five signals.

**A real gap this surfaces**: `dataset_versions` only has rows for
externally-ingested sources — there is no row for `gdpval_evaluations`,
because it's paid-API-generated, not file-ingested. Now that the GDPval
restore is committed (§8), the restore script needs to register a
`dataset_versions` row on completion (same ADR-002 pattern every other ingest
follows) or the vintage stamp and fingerprint hover will have nothing to show
for a signal that's actually populated. Keep the two mechanisms' jobs
separate: the **fingerprint** answers "is this signal here at all" (already
correctly designed to render hollow when absent); the **vintage stamp**
answers "how current is what's here" — don't conflate a coverage gap with a
freshness question, they're different facts a viewer needs.
