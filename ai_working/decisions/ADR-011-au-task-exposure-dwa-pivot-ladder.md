---
date: 2026-07-12
status: accepted
agents: []
prd_section: FR-9.2
---

# AU Task-Level AI-Exposure via a DWA-Pivot Decision Ladder

## Context

FR-9.2 attaches the platform's existing AI-exposure signals — scored at **O*NET Detailed Work Activity (DWA)** grain (17,537 Eloundou DWA scores + Microsoft IWA data) — onto Australian task structure, so `region=AU` returns Australian-native tasks instead of US tasks re-weighted.

The available AU sources differ sharply in how well they can carry a DWA-grain signal:

- **OSCA 2024** (backbone, FR-9.1) — its "main tasks" are few, broad, GenAI-generated, and have **no DWA linkage**. No meaningful O*NET-task→OSCA-task crosswalk exists.
- **Australian Skills Classification (ASC v3.0)** (JSA) — specialist tasks that were *built from* O*NET DWAs (21.2/23.1), pruned for AU, reworded, clustered.

**B0 spike outcome (confirmed 2026-07-12).** We acquired the actual ASC files (via the `strayr` R package) and inspected them. `asc_specialist_tasks` (10,963 rows), `asc_core_competencies` (6,000), and `asc_technology_tools` (1,989) are **all keyed only on ANZSCO** and carry **no source-DWA / IWA / O*NET-task identifier column**. The DWA ancestry exists conceptually but is **not recoverable from the published data**. Therefore an `L1 dwa_lookup` join is impossible; the bridge **must be semantic**.

We need a rule that (a) uses the best available signal per occupation, (b) degrades gracefully, (c) never presents a modelled estimate as a measurement, and (d) is credible enough to publish.

## Decision

Pivot the AU task-level plane on the **DWA**, with the **ASC specialist task as the exposure carrier** and OSCA as backbone + descriptor. Resolve every (occupation × task) through a **decision ladder** assigning a `task_level_method` and `confidence`. Keep **availability** (binary) and **confidence** (graded) as separate fields, and keep **occupation-level exposure** as a distinct near-complete plane so "no task detail" never reads as "no exposure".

### The ladder (stop at first rung whose precondition is met)

- **L0 — Occupation crosswalk (precondition).** Resolve OSCA ↔ ISCO-08 ↔ O*NET-SOC via official correspondences. If not crosswalkable → `not_available` for all exposure. Else compute **occupation-level exposure** (`exposure_occupation_level`), available regardless of task-level outcome.
- **L1 — DWA lookup (`dwa_lookup`, conf 0.95). NOT AVAILABLE for ASC v3.0** — no source-DWA column (B0). Retained in the ladder only for a future source that exposes lineage; `asc_specialist_task.source_dwa_id` stays nullable so the schema fits if one appears.
- **L2 — Semantic DWA↔ASC-task (`semantic`, conf = cosine, floor 0.60). THE LIVE MEASURED RUNG.** Embed O*NET DWA text and ASC specialist-task text (existing `all-MiniLM-L6-v2` + pgvector). Reliable here (unlike OSCA) because ASC tasks are reworded DWAs — texts are close by construction. Below floor → unmatched, descends to L3/NA.
- **L3a — Derived neighbour (`derived_neighbour`, cap 0.50; opt-in, non-headline).** Occupation not in ASC coverage → borrow nearest covered occupation's profile (prefer shared ANZSCO/OSCA parent). Records `proxy_source_occupation`.
- **L3b — Derived from OSCA tasks (`derived_osca`, cap 0.30; off by default).** Weak semantic match of OSCA main tasks ↔ DWA. Exploratory only.
- **L4 — Not available.** `task_level_available = false`, `confidence = NULL`. `exposure_occupation_level` from L0 still stands.

### Governance rules

- `task_level_available = true` iff ≥1 task reached L1 or L2 (measured). Derived rungs do not set headline availability.
- **Headline / publishable metrics use L1 + L2 only.** L3a/L3b are exploratory, labelled, capped, never blended.
- OSCA `main` tasks are `descriptor_only`; task-level exposure columns reject writes against them.
- Publish a **coverage-by-tier report weighted by employment** (measured vs derived vs NA share of AU workforce) as a first-class honesty metric — reuses the ADR-010 apportionment weights.

### Attachment specifics (from confirmed data)

- ASC is keyed at **4-digit ANZSCO** → resolve to OSCA occupations by reusing the ADR-010 4-digit→OSCA expansion (a unit group's tasks apply to its OSCA children).
- Roll DWA exposure to occupation using ASC's `percent_of_time_spent_on_task` as the importance weight (source-provided; resolves the DWA-beta aggregation weighting).
- Keep US-imported and AU-native exposure in **separate columns**; emit a `us_au_divergence` flag — divergences are the publishable insight, not noise.

## Consequences

**Positive.** Uses best-available signal per occupation and degrades gracefully; every value is method-tagged and inspectable; modelled derivations cannot masquerade as measurements; leverages existing DWA exposure + embedding infrastructure; the coverage metric turns the ASC coverage limit into a stated, defensible number.

**Negative / costs.** With L1 unavailable, **all measured tasks are L2 (modelled semantic matches)** — the 0.60 cosine floor needs empirical validation on a labelled sample; ASC covers ~600 occupations so a real slice of the OSCA universe is task-level NA or derived (quantify + disclose); the ladder adds schema (`task_level_method`, `confidence`, `proxy_source_occupation`, `dwa_asc_bridge`), compute and tests.

## Alternatives considered

1. **O*NET-task → OSCA-task semantic mapping.** Rejected: OSCA tasks are broad GenAI summaries with no DWA link; low-fidelity.
2. **Occupation-level exposure only (no task layer).** Rejected: this is essentially today's ANZSCO approach and forfeits the AU-native differentiator.
3. **Single blended confidence across methods.** Rejected: launders low-confidence derivations into apparent measurements; violates availability≠confidence and no-silent-blending invariants.
4. **Wait for a DWA-lineage-bearing ASC release / reconstruct lineage from JSA methodology docs.** Rejected for v1: not published; the semantic bridge is high-fidelity here because ASC tasks are reworded DWAs.
