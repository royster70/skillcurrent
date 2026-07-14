# Claude Design — Iteration 2 Input: API Readiness & Open-Source Requirements

Created: 2026-07-14
Purpose: Directive for the **next** Claude Design iteration on the Tier 1
"Waterline" explorer. Iteration 1 produced the wireframe canvas (turns 1–7) and
`design_handoff_waterline_explorer/api-requirements-from-wireframes.md`. This
folds in two bodies of work done since: **(A) a field-by-field API-readiness
review** and **(B) open-source design requirements** that the first pass, aimed
only at "HR/business leaders with a question," did not account for.

Read `tier1-waterline-explorer-brief.md` (esp. §6, §8, §11) for depth. This
document is the *delta since iteration 1* + *this-round goals* — keep it as the
working directive.

---

## Part A — API readiness: design against what is actually buildable

### A1. Loaded and ready NOW — design against this, not a wish-list
Everything below is in the DB today and has a live endpoint or a trivial one:
- **Waterline** (sector avg exposure), **sectors → occupations → tasks** drill,
  the **3-box matrix** (`/occupations/{soc}/matrix`), **drift**, **US↔AU
  divergence**, the **facet browser** (`sector`/`major_group`/`zone` filters).
- **The "capability rising over time" trendline itself** — from **Epoch ECI**
  (`gptval_benchmarks`, CC-BY, 6 Sonnet generations 2024→2026). This is loaded,
  owned, redistributable. **The temporal headline ships now, for free.**
- **GDPval task coverage** — the 44 benchmark occupations are known now
  (`gdpval_tasks`, `gdpval_benchmark_count`).

### A2. The verified API delta
The api-requirements doc was reviewed field-by-field against live code and is
**accurate** (every ✅ confirmed present, every 🆕 confirmed absent). See its new
`§0`. Design can trust the ✅/🔧/🆕 markings. The genuinely-new backend work
(🆕/🔧) is: per-row `signal_coverage` + `evidence_tier`, matrix `?region`, the
3-region membership, `au_mapping`, `/occupations/facets`, `/signals`.

### A3. One SHIPPED BUG to design around — do NOT animate usage as capability
`EraSnapshot.automation_potential` is `min(task_pct/5.0, 1.0)` — AEI **usage
share** rescaled, in a field named like the real capability score. The
era-scrubber's *task-level* motion is therefore a usage proxy until GDPval
scores land. **Design it labelled as usage** ("attention rising"), never as
"automation increasing." (brief §8.1; api-doc §0.)

### A4. Fill-later seams — design for absence, it is already the shape
- **GDPval has TWO states, do not collapse to one boolean:** *task-covered*
  (44 occs, known now → coverage-fingerprint dot accurate today) vs *scored*
  (0 now, fills after a paid run → the capability panel + real scrubber motion).
  A covered-but-unscored role shows **"benchmark defined, not yet measured"** —
  a first-class absence (wireframe 6a), not a fake zero, not a missing dot.
- **The durable eval dataset is built and lab-agnostic** (committed CSVs +
  ingest; keyed by `model_era`, Claude *or* OpenAI). When scores land, the
  coverage-adaptive UI lights up with **zero frontend change**. So design the
  scored panels now; they simply render empty-state until data arrives.
- **Epoch = the trendline (length); GDPval = occupation-grounding (fill later).**
  The MIT GDPval task set contains no scores, so it cannot itself be a trendline.

---

## Part B — Open-source design requirements (NEW this round)

### B1. Audience is not one persona
The redesign is going open-source, so it serves ≥4 audiences with different
needs, not just "HR/business leaders with a question":
- **Contributors** — the data model + extension points (FR-9.5 signal registry).
- **Researchers / citers** — derivation methodology + confidence tiers, before
  they will trust or cite a number.
- **Self-hosters / forkers** — a "run this yourself" path (ties to the
  seed-dataset / docker-compose workstream). **The wireframes have no such entry.**
- **Casual visitors from a link** — closer to a browsing mood than "fastest to
  data."
This does NOT reopen the landing decision — the **waterline stays the visual
front door** (7a/7b, not 7c). It adds destinations.

### B2. Two destinations the wireframes lack — design them this round
1. **"How this works" — a first-class methodology destination, not a glossary
   popover.** Real content a citer needs: how β is computed (Strategy A, and the
   unbuilt Strategy B), what the evidence tiers mean, provenance + licence per
   signal. Seed from existing repo docs that no site visitor would find today:
   `docs/ARCHITECTURE.md`, `docs/data-sources.md` (licences/attribution), the
   ADR index.
2. **"Run this yourself" — a visible entry point** for the self-host path, not an
   assumption someone finds the README.

### B3. Provenance leads, and it must be honest about *which* date
Two dates per dataset mean different things — **lead with source vintage, not
pipeline-refresh:**
- **`version_key`** (source vintage — Eloundou `2024_science`, O*NET `28.1`) is
  what a researcher needs; **`ingested_at`** (local refresh) would falsely imply
  uniform currency across signals with wildly different real cadences.
- Mechanism (no new device): extend the **coverage fingerprint** so each of the
  5 signal dots carries "as of `<version_key>`" on hover; pair with a compact
  always-visible **vintage stamp** (wireframe 1c already sketched
  "DATA v2026.06 · …") elevated to a cross-direction requirement showing the real
  *spread* of vintages, not one blanket date. Keep the two jobs separate:
  fingerprint = "is this signal here"; vintage stamp = "how current is it."

### B4. CDN-first + build-time feature flag (reaffirm, already in 1d)
Static-first: pre-rendered JSON off a CDN; `VITE_DEPLOYMENT_MODE=cdn|full`
dead-code-eliminates the LLM company-classify path in CDN builds; search box
gets an inline capability note. Don't badge the whole CDN build "lite" — scope
the narrower-capability note to exactly the search box + classify.

---

## Part C — This-round goals for Claude Design

1. **Resolve the aesthetic direction (1a/1b/1c).** Still open. Recommendation:
   **1c (Instrument) warmed toward 1a's palette** — rigor-signalling and
   functional (keeps the data-bearing devices: draft marks, soundings), without
   1a's full nautical costume that risks reading as gimmick to the researcher/
   self-host audience, and without 1b throwing away the isomorphic devices. Keep
   both light + dark (don't let instrument = dark-only). Confirm, then go hi-fi.
2. **Design the two new open-source destinations** (B2) — "how this works" and
   "run this yourself" — the wireframes have neither.
3. **Design the provenance surfaces** (B3) — fingerprint "as of" + the global
   vintage stamp.
4. **Reconcile the existing screens with "build-now" reality** — GDPval panels
   render covered-not-scored (empty-state), Epoch carries the trendline, the
   scrubber's task motion is labelled usage until scores land.
5. **The 4 still-open API decisions** (api-requirements §5): region-3 boundaries,
   evidence-tier rule, facet-count location (server vs client), and confirming
   no cross-era *sector* aggregates needed in v1.

---

## What to hold constant (validated — do NOT re-litigate)
- The **palette** (CVD/contrast-validated) and the **E0/E1/E2 zone system**
  (thresholds fixed: E2 ≥ 0.85, E1 0.40–0.85, E0 < 0.40; β scale 0–1.5;
  median tick 0.27).
- The **coverage fingerprint**, the **draft-mark gauge**, and the **dual
  absolute-gauge + relative-DWA-grid** resolution (brief §5.2 — DWA fragments
  are ranked relatively, never zone-classified against absolute thresholds).
- **Morph/FLIP transitions** for drill-down and US↔AU (brief §3.8).
- **Occupation browser = grouped tile grid, NOT a literal periodic table**
  (brief §3.9 — sector×job-family don't form a real dual-ordered matrix).
- The **coverage-adaptive detail** principle (6a/6b): no empty chrome, no fake
  zeros, one honest absence note; solid vs hollow marks = measured vs theoretical.
