# SkillCurrent — Brand Brief (v1)

> Derives the SkillCurrent identity from the name and the existing "Warm
> Instrument" design language (`design_handoff_waterline_explorer/`,
> `tier1-waterline-explorer-brief.md`). This is the brand layer *above* the UI
> design tokens — same system, one voice. Living draft; iterate freely.

---

## 1. Essence

**SkillCurrent** is open intelligence for the changing world of work — it
combines occupational data, task-level research, and observed AI usage to show
how work is shifting, and helps people, organisations, and educators decide
**what to learn next.**

- **Promise:** *see what's coming, and adapt* — foresight and human agency, not
  fear. A forecast, not an alarm.
- **Stance:** a *warm instrument* — rigorous and measured, but human and hopeful.
- **One line:** *Open intelligence for the changing world of work.*

## 2. The idea — "the Current"

The name is the model. **Current** means three things at once, and all three
are the product:

1. **a current** — the flow/force of AI capability reshaping the task landscape;
2. **current** — up-to-date, present-tense (the platform's job: where the line
   sits *now* and where it's heading);
3. **an electrical current** — a live, driving force.

Crucially, a current is something you **read and navigate**, not a flood you flee
— that is the positive reframe, and **navigation is where human agency lives.**
SkillCurrent is the instrument you navigate the currents *with*: you can't stop
the water, but you can read it, set a course, and reach higher ground. AI is the
water; **human skills are the elevation** that keeps work above the rising line
(the matrix Y-axis / `asc_core_competency`). The brand leads with the navigator
and the high ground — never the deluge.

## 3. Audiences

| Audience | What they want from the brand |
|---|---|
| Workforce / HR planners, policy, educators | clarity, credibility, "what to do next" |
| Researchers / citers | rigor, provenance, methodology, a citable name |
| Contributors / self-hosters | a real, distinctive OSS project, cleanly run |
| Casual visitors | a hopeful, legible "what's happening to work" story |

## 4. Vocabulary system (the payoff of the name)

Everything nests under one product. Use these terms consistently in UI, docs,
and copy:

| Term | Meaning |
|---|---|
| **SkillCurrent** | the product / platform (head-word) |
| **the Current** | movement/drift over time — the temporal signal |
| **Waterline** | the flagship exposure view (E0/E1/E2 against the rising line) |
| **Freeboard** | the human-margin metric — skills still above the line |
| **Soundings** | the measurements / provenance reports |

## 5. Verbal identity

- **Wordmark:** `SkillCurrent` — one word, camelCase, capital S + C. Never
  "Skill Current", "Skillcurrent", or "SC" in prose.
- **Tagline — CONFIRMED (2026-07-14):** *Open intelligence for the changing world
  of work.* Sentence case. "Open" carries double weight — open-source **and**
  open/accessible. Documented alternates / sub-heads (swap freely):
  - *Open intelligence for navigating the changing world of work.* (navigation-forward)
  - *Read the current. Set your course.*
  - *See what's coming — and what to learn next.*
- **Voice & tone — "Warm Instrument":**
  - Rigorous, plain, quietly confident; numbers are tabular and exact.
  - Hopeful and agentic — *adapt*, *high ground*, *what to learn next*; never
    *doom*, *disruption*, *drowning*.
  - Honest over impressive: name what's measured vs modelled, current vs stale.
  - Say "usage" when it's usage and "capability" when it's capability — never
    blur them (see §9).

## 6. Logo / wordmark direction

- **Concept:** the word carries the metaphor — `Skill` set steady (the fixed
  ground), `Current` given a *flow* treatment (a single streamline underscore,
  or a subtle wave ligature on the "rr"/"u"). Movement lives in the second half.
- **Mark:** a lone streamline / contour glyph drawn from the *soundings* device
  — a flowing line that can double as an S-into-C curve. Works as an app icon
  and favicon at 16px as a single stroke.
- **Rules:** clear space = cap-height around the mark; monochrome fallback
  (ink on ground) must hold; never stretch, re-hue, or add a gradient to the
  mark; favicon = the streamline glyph alone (one or two strokes).
- **Logo status — DEFERRED (2026-07-14):** a commissioned logo comes later.
  Until then the identity is a **typographic** wordmark (Georgia; the flow
  flourish optional) with a simple streamline favicon. The brief stays
  logo-agnostic — do not block any build on a final mark.

## 7. Colour — adopt the Warm Instrument palette

Formalises the validated design-token palette. **Replaces the legacy dark-
sidebar / orange theme** (old `constants.ts` E0 #F97316 / E1 #2563EB /
E2 #16A34A — do not mix old and new). Light is default; dark is first-class.

| Role | Light | Dark |
|---|---|---|
| Ground | `#f2f6f5` | `#071019` |
| Surface | `#ffffff` | `#0f1e29` |
| Ink | `#0e1f27` | `#e7f1ef` |
| Brass (instrument accent) | `#9c6414` | `#e3a344` |
| Zone E0 — insulated (above water) | `#b06a1a` | `#b5793a` |
| Zone E1 — augmented (at the line) | `#146f9e` | `#3f8fc2` |
| Zone E2 — automated (submerged) | `#0d8f6e` | `#3fa98d` |

Signal hues (per source): eloundou `#a02f5c` · microsoft `#1f6fd6` ·
aei `#0e9a72` · gdpval `#9c3f14` · jsa-au `#4a9440`.

**Usage:** zone hues carry *fixed* meaning (never decorative); brass is the
single instrument accent (draft marks, the waterline, the current); current-
lines flow *across* the zones. Never rely on hue alone — pair with solid/hollow
marks (§10) so it reads without colour and meets contrast.

## 8. Typography

System stacks only — **no font embedding** (fast, licence-clean, OSS-friendly).

- **Display:** Georgia (serif) — headings, the wordmark voice.
- **Body:** Segoe UI-led sans stack.
- **Data:** Consolas-led mono, **tabular-nums** — every number, score, β value.

Fixed data conventions: β scale 0–1.5; zone thresholds E2 ≥ 0.85 / E1 0.40–0.85 /
E0 < 0.40; median tick 0.27.

## 9. Motion — "the Current" is the data, not decoration

- **Principle:** movement *is* the signal. `task_drift_metrics` and the era
  scrubber ARE the current — render them as flowing streamlines / migrating
  marks as the waterline rises, not as ornament.
- **Honesty in motion:** propagated (non-measured) movement renders dashed and
  is off by default (ADR-011). Until GDPval capability scores exist, scrubber
  motion is labelled **usage share** ("attention rising"), never "automation
  increasing."
- **Navigation, not spectacle:** motion serves *wayfinding* — the era scrubber,
  region toggle, and matrix are how a user **navigates the currents** (sets a
  course, compares eras, finds higher ground), never an autoplaying show.
- **Fallback:** everything has a reduced-motion / no-JS state (era filmstrip) —
  motion is enhancement, never the only way to read the data.

## 10. Visual devices (hydrographic)

Draw from the existing kit: **soundings** (depth measurements), **contours**,
**draft marks**, the **waterline**. Two load-bearing conventions:

- **Solid vs hollow marks = measured vs theoretical** (evidence tier up front).
- **Provenance fingerprints** — per-signal dots ("is this signal here") + a
  global vintage stamp showing the *spread* of signal vintages ("how current is
  it"), on `version_key`, never `ingested_at`.

## 11. Applications

App header/sidebar wordmark · favicon (streamline glyph) · README hero + one-
line · social/OG card (wordmark + tagline on ground, a single current line) ·
docs headers · the "Run this yourself" footer strip.

## 12. Honesty rules (the brand is the trust)

- No fake zeros, no empty chrome — absent signals collapse to one honest note.
- Label **usage vs capability**; **measured vs modelled**; show provenance.
- `licence` per signal comes from a curated `signals.json` until FR-9.5's
  `signal_source_registry` lands (it is not yet a DB field).

## 13. Do / Don't

| Do | Don't |
|---|---|
| Lead with adaptation & high ground | Frame AI as flood / doom / "coming for your job" |
| `SkillCurrent` (one word) | "Skill Current" / "SC" / lowercase |
| Warm Instrument palette, light default | Reuse the old orange/dark-sidebar theme |
| Tabular mono for every number | Proportional figures in data |
| Motion = the data (with reduced-motion fallback) | Decorative animation |
| "usage" vs "capability" precisely | Blur measured and modelled |

## Resolved decisions (2026-07-14)

1. ✅ **Primary tagline** — *Open intelligence for the changing world of work.*
   (sentence case; a navigation-forward variant is kept as an alternate — §5).
2. ⏳ **Logo / wordmark** — **deferred**: commission a real logo later; a
   typographic wordmark + streamline favicon serve in the interim (§6). The only
   still-open item, and it blocks nothing.
3. ✅ **Water stays literal** — keep water + motion in the UI; the metaphor is
   **"currents you navigate"** — human agency via wayfinding (§2, §9). Not the
   drier terrain-only route.

## Related
- `tier1-waterline-explorer-brief.md` — the explorer design brief
- `design_handoff_waterline_explorer/` — wireframes + API-readiness
- `../../../docs/PUBLISHING.md` — open-source topology (brand ships with it)
