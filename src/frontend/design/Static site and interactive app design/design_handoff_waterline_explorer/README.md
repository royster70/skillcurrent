# Handoff: Tier 1 Waterline Explorer — Wireframe Phase

> **Updated 2026-07-14 (iteration 2, turns 8–9):** aesthetic direction resolved
> to "Warm Instrument" (8a); open-source destinations, provenance surfaces,
> build-now honesty rules, and the Epoch worked-example module added below.

## Overview
Design exploration for the Tier 1 (public Industry Intelligence) explorer:
sector waterline view, occupation browser, occupation detail (task matrix +
table), era scrubber, coverage-adaptive layouts, and landing/explainer.
Produced in Claude Design against the design brief
(`frontend/design/tier1-waterline-explorer-brief.md`) and the live codebase
(`frontend/src`).

## About the Design Files
`waterline-wireframes.html` is a **design reference created in HTML** — a
pan/zoom canvas of wireframe options, not production code. The task is to
**recreate the chosen designs in the existing Vite + React + recharts
codebase** using its established patterns (inline-style components,
`src/lib/constants.ts` tokens, `useApi` hook), not to ship this HTML.

## Fidelity
**Low-fidelity (lofi).** These are wireframes: structure, flow, interaction
patterns, and data-honesty rules. Do NOT copy pixel values, sketch fonts, or
placeholder numbers. Apply the design tokens below; final hi-fi mocks are a
later phase.

## How to read the canvas
Newest work at top. Turns are numbered sections; options are ids like `3a`.
Turn 1 = three overall aesthetic directions (1a hydrographic / 1b executive /
1c instrument) + CDN-vs-full build seams (1d). Turns 2–7 iterate specific
screens. Handwritten-style annotations on the wireframes are design intent
notes for the implementer.

## Decision log (user-confirmed)
- **Detail view = 3-box matrix using LinkedIn's geometry** (turn 3):
  X = Automation Potential (Human Only → AI Ready), Y = Human Value Add
  (Routine → Strategic). Insulated = full-height left column; Augmented =
  top-right; Disrupted = bottom-right. Maps onto the existing
  `/occupations/{soc}/matrix` axes; quadrant names already match.
- **Matrix pairs with a task table** (turn 4) carrying metadata the chart
  can't show: weight (US importance / AU % of day — labeled, never blended),
  drift, usage %, per-task signal coverage. Zone-colored row accents match
  the boxes. Preferred combo trending toward 4a (linked side-by-side) +
  4b (chart⇄list toggle with FLIP morph); not yet final.
- **Era scrubber** (turn 5): defaults to CURRENT era, playable in detail
  views only; scrub state never leaks to other views. Options 5a (inline
  timeline), 5b (replay), 5c (ghost compare — CDN-friendliest); combo
  5a+5c suggested, not yet final.
- **Coverage-adaptive detail** (turn 6): the page reshapes to per-role signal
  availability. No empty chrome, no fake zeros — absent sections collapse to
  one honest absence note. Evidence tier surfaced up front; solid vs hollow
  marks = measured vs theoretical.
- **Landing needs an explainer before data** (turn 7): options 7a (narrative
  scroll morphing into the live chart), 7b (collapsible 3-card primer),
  7c (question-led entry). Not yet chosen; 7a+7b combo suggested.
- **One design, feature-flagged** for static/CDN vs full builds (1d):
  identical look; search box gets an inline capability note; company lookup
  simply doesn't render in CDN builds (build-time elimination via
  `VITE_DEPLOYMENT_MODE`).
- **Overall aesthetic direction: "Warm Instrument" (8a)** — 1c's mono/tabular
  rigor + 1a's palette and data-bearing devices (draft marks, soundings,
  waterline kept; cartouche/hatching/rope dropped). Light AND dark from the
  start; light is default. Current UI (dark sidebar / Inter / orange) is
  slated for full replacement.

### Iteration 2 (turns 8–9, open-source audience)
- **Audience expanded for open-sourcing**: contributors, researchers/citers,
  self-hosters, casual visitors — in addition to HR/business leaders. The
  waterline stays the front door (7a/7b); new destinations added, landing
  decision NOT reopened.
- **"How this works" methodology page (8b)**: pipeline diagram (sources →
  crosswalk → β → zones) with per-stage expansion + worked example; source
  registry table (signal, vintage `version_key`, licence, coverage) rendered
  from `signals.json`; Strategy B shown as designed-but-unbuilt; cite-this-page
  (BibTeX/APA). Content seeds from `docs/ARCHITECTURE.md`,
  `docs/data-sources.md`, ADR index.
- **"Run this yourself" (8c)**: persistent footer strip (both builds) →
  one-page path with three tiers: ① static mirror (the CDN build doubles as
  the fork path), ② docker-compose full stack, ③ add-a-signal (FR-9.5
  registry — the fingerprint is extensible, not hardcoded).
- **Provenance (8d)**: fingerprint dots carry "as of `version_key`" on hover
  (never `ingested_at`); GDPval dot has THREE states — scored (solid),
  covered-not-scored (half-filled), none (hollow); global vintage stamp in
  the header shows the SPREAD of signal vintages on a mini-timeline, never
  one blanket date. Fingerprint = "is this signal here"; stamp = "how
  current is it" — two devices, two jobs.
- **Build-now honesty (8e)**: GDPval capability panels render a
  covered-not-scored empty state ("benchmark defined, not yet measured") and
  fill with zero frontend change when scores land; era-scrubber task motion
  is labelled **usage share** ("attention rising"), never "automation
  increasing", until GDPval scores exist; Epoch ECI (loaded, CC-BY, 6 Sonnet
  generations) powers the "capability rising" trendline now.
- **Epoch worked-example module (turn 9)**: suggested combo — 9c group-tide
  on the landing (roles as horizontal lines the rising waterline submerges;
  purely real time-series), 9a scroll-pinned single-role story on the
  methodology page (pinned trendline + role matrix stepping through eras,
  reuses the 5a scrubber component), 9b static era filmstrip as the
  no-JS/reduced-motion fallback. Not yet final.

## Open decisions (blocking, see API doc §5)
1. Exact 3-box boundary values on both axes.
2. Evidence-tier rule (signal combinations → tier names).
3. Facet-count computation: server endpoint vs client-side only.
4. Confirmation that no cross-era sector aggregates are needed in v1.
5. Turn-9 module placement (suggested: 9c landing / 9a methodology / 9b
   fallback) and the ~3 curated showcase roles for the worked example.

## Interactions & Behavior (key rules)
- Hover matrix dot ⇄ table row: bidirectional highlight (4a).
- Chart⇄List toggle: FLIP morph, dots fly to rows (4b, brief §3.8).
- US⇄AU region toggle: task dots animate across box boundaries; weight
  column relabels (Importance ⇄ % of day).
- Era scrub: dots migrate; propagated (non-measured) movement renders dashed
  + off by default (ADR-011 convention).
- Slicers cross-narrow to non-empty options; empty states suggest nearest
  non-empty combination.
- localStorage: landing explainer collapse state; era state is NOT persisted.

## State Management
- Region (US/AU) — URL search param, per existing app convention.
- Era — local component state in detail views only; resets to current.
- Facet selection — URL params (sector, major_group, zone) for shareability.
- Explainer seen/collapsed — localStorage.

## Design Tokens (from the validated brief palette — hi-fi phase)
⚠ These REASSIGN zone hues vs today's `src/lib/constants.ts`
(E0 #F97316 / E1 #2563EB / E2 #16A34A). Do not mix old and new.

Light: ground #f2f6f5 · surface #ffffff · ink #0e1f27 · brass #9c6414
Zones: E0 #b06a1a · E1 #146f9e · E2 #0d8f6e
Signals: eloundou #a02f5c · microsoft #1f6fd6 · aei #0e9a72 ·
gdpval #9c3f14 · jsa/au #4a9440
Dark: ground #071019 · surface #0f1e29 · ink #e7f1ef · brass #e3a344 ·
zones #b5793a / #3f8fc2 / #3fa98d
Type: Georgia (display) · Segoe UI-led sans (body) · Consolas-led mono,
tabular-nums (data). System stacks only — no font embedding.
Zone thresholds unchanged: E2 ≥ 0.85, E1 0.40–0.85, E0 < 0.40; β scale 0–1.5
fixed; median tick 0.27.

## Assets
None — no images used. All charts are HTML/CSS wireframe drawings.

## Files
- `waterline-wireframes.html` — self-contained wireframe canvas (open in any browser)
- `api-requirements-from-wireframes.md` — API work derived per wireframe option
- Source context (already in the repo, not duplicated here):
  `frontend/design/tier1-waterline-explorer-brief.md`,
  `frontend/design/sector-subdivision-mockups.md`
