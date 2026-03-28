---
date: 2026-03-29
status: accepted
agents: []
prd_section: FR-8.9
---

# Census Data Integration and Subdivision-Enriched Classification

## Context

FR-8.9 AU data integration initially loaded JSA Occupation Profiles (2025) with a synthetic 50/30/20 employment distribution across each occupation's top 3 industries (ADR-004, Decision 3). This gives employment-by-occupation within ANZSIC divisions but lacks two things:

1. **Actual occupation composition per sector** — what percentage of Division D workers are Technicians vs Professionals vs Managers? The JSA data tells us *which occupations* exist in a sector but not the *workforce structure* of that sector.
2. **Sub-sector granularity for company classification** — Division D ("Electricity, Gas, Water and Waste Services") is too broad. AGL Energy (generation + retail + gas + telco) and AusNet Services (distribution + transmission only) both classify to Division D, despite fundamentally different business profiles and workforce needs.

ABS 2021 Census Working Population Profiles provide both: cross-tabulated employment counts (ANZSIC × ANZSCO) and ANZSIC subdivision employment from JSA Industry Data Table 3 provides the sub-sector breakdown.

## Decision 1: Census WPP as Complementary Data Source

### The choice

Load Census 2021 W12A (Industry × Occupation, 180 rows) and W13 (Occupation × Sex, 159 rows) as **complementary** data alongside JSA 2025 employment — not as a replacement.

### Rejected alternatives

1. **Replace JSA with Census for all AU employment** — Census is 4 years old (2021 vs JSA 2025). Occupation counts have shifted post-pandemic. JSA is the current labour market estimate.
2. **Wait for 2026 Census** — The next Census is scheduled for August 2026. Waiting delays AU sector intelligence by 6+ months plus ABS processing time.
3. **Use ABS TableBuilder for full 506-class ANZSIC granularity** — Requires registration, manual export, and ongoing access management. The WPP data pack is freely downloadable (CC-BY 4.0).

### Rationale

Occupation *composition* (what % of a sector are Professionals vs Technicians) changes slowly — the structural mix of Division D hasn't shifted dramatically between 2021 and 2025 even though headcounts have. Census W12A provides the canonical cross-tabulation for this structural view. JSA provides the current headcount totals. Together they answer: "Division D has 175,300 workers (JSA 2025), of whom ~21% are Technicians (Census 2021 structure)."

### Trade-off

The 4-year vintage mismatch is acknowledged and visible in the API (`census_year: 2021` is always returned). When the 2026 Census is available, the ingest script (`ingest_abs_census_wpp.py`) re-runs with the new file and the integrity hash comparison handles the update automatically.

## Decision 2: Occupation Mix as Sector-Level Intelligence

### The choice

Expose Census W12A data as an `occupation_mix` array on AU sector responses — listing the 8 ANZSCO major groups with employed counts and percentage shares per ANZSIC division.

### Implementation

- `GET /sectors/{code}/occupation-mix` — dedicated endpoint returning the full mix for one sector
- `occupation_mix` field on `SectorSummary` (AU only, `None` for US) — batch-loaded on list_sectors
- `occupation_mix` on `CompositeSectorResponse` — employment-weighted blend across selected sectors
- `workforce_profile` on `ClassifyResponse` — blended mix for a company's classified sectors

### Rationale

Occupation mix is sector-level intelligence (not occupation-level), answering "what does the workforce of this sector look like?" This is the consulting question — when advising an energy company, the first thing a workforce planner needs is the structural composition of the sector they operate in.

## Decision 3: ANZSIC Subdivisions as Prompt Context (Not Schema Routing)

### The choice

Load 214 ANZSIC subdivisions from JSA Industry Data Table 3 and inject them into the AU company classify prompt as contextual examples — **without changing the sector codes stored in the database or used for routing**.

The classify endpoint still returns Division-level codes (A–S). But the prompt now shows:

```
D: Electricity, Gas, Water and Waste Services
   Sub-sectors: Electricity Generation (32,900), Electricity Distribution (31,800),
   Gas Supply (11,300), On Selling Electricity (9,000), ...
```

### Rejected alternatives

1. **Return subdivision codes in the classify response** — Would require downstream changes to composite sector, sector detail, and occupation matching. The platform standardises on Division-level for employment weighting (ADR-004). Subdivisions don't have associated employment profiles.
2. **Expand to 506 ANZSIC classes** — Prompt would exceed token budget. 214 subdivisions (top 6 per division = ~114 entries) is already at the practical limit for a 256-token-output Haiku call.
3. **No subdivision context** — Baseline accuracy. Haiku 3.5 with bare division names achieved 64% multi-sector detection. Insufficient for consulting-grade classification.

### Rationale

Subdivision context is a **zero-schema-cost accuracy improvement**. The LLM uses structural employment fingerprints to reason about business profiles. Division D with "Electricity Generation (32,900)" and "On Selling Electricity (9,000)" tells the model that this sector has both infrastructure and retail sub-sectors — enabling it to classify AGL (which spans both) differently from AusNet (which only operates in infrastructure).

### Measured effect

| Metric | Haiku 3.5 (bare divisions) | Haiku 4.5 + subdivisions |
|--------|---------------------------|--------------------------|
| Primary sector correct | 10/10 | 10/10 |
| Multi-sector detection | 7/11 (64%) | 10/11 (91%) |
| AGL vs AusNet differentiation | Both returned `['D']` | AGL=`['D','G']`, AusNet=`['D']` |

## Decision 4: W13 (Occupation × Sex) for Diversity Analytics

### The choice

Load Census 2021 W13 (159 rows: 51 ANZSCO sub-major groups × 3 sex codes) as a future-ready diversity data source. Not currently surfaced in any endpoint but available for sector gender composition overlays.

### Rationale

W13 was in the same data pack as W12A (zero incremental acquisition cost). Gender composition per occupation category is a natural extension of the occupation mix — "21% of Division D are Technicians, and of those Technicians nationally, 83% are male" (Census 2021 W13 cross-reference). Deferred to avoid scope creep in the current sprint.

## Consequences

**Benefits:**
- Census provides the actual occupation × industry cross-tabulation that JSA's 50/30/20 approximation cannot
- Subdivision prompt context dramatically improves multi-sector classification for diversified companies
- Zero schema changes — subdivisions enrich the LLM prompt without affecting routing or storage
- `occupation_mix` gives immediate consulting value for sector workforce profiles
- W13 diversity data ready for future overlays

**Trade-offs:**
- Census 2021 is 4 years behind JSA 2025 — structural composition may have shifted for fast-changing sectors
- Subdivision prompt injection doesn't scale beyond ~6 entries per division (prompt length constraint)
- W13 diversity data is not yet surfaced — future work

**Risks:**
- Census data staleness: Low — structural occupation composition changes slowly; `census_year` field is always visible
- Subdivision data drift: Low — JSA Industry Data is updated annually; ingest script is idempotent with hash comparison
- 2026 Census availability: Medium — ABS typically publishes WPP packs 12–18 months after Census night

## Implementation

### Database (migrations 018–020)

| Table | Rows | Source | Migration |
|-------|------|--------|-----------|
| `abs_census_wpp` | 180 | Census 2021 W12A | 018 |
| `abs_census_w13` | 159 | Census 2021 W13 | 019 |
| `anzsic_subdivisions` | 214 | JSA Industry Data Table 3 | 020 |

### Ingest scripts

- `scripts/ingest_abs_census_wpp.py` — wide CSV → long format, suffix-matching parser
- `scripts/ingest_abs_census_w13.py` — sex suffix stripping, sub-major group mapping
- `scripts/ingest_anzsic_subdivisions.py` — Excel Table 3 parser, division name → code mapping

All follow ADR-002 integrity hash pattern (SHA-256 on source file, skip on match, delete-and-reload on change).

### API endpoints

- `GET /sectors/{code}/occupation-mix` — Census mix for one AU sector
- `occupation_mix` on `SectorSummary` (AU), `CompositeSectorResponse` (AU), `ClassifyResponse` (AU)
- `workforce_profile` on `ClassifyResponse` — blended Census mix across classified sectors
- `single_sector_asx` flag on `CompanySearchResult` — flags under-classified ASX companies

## Reassessment Triggers

| Trigger | Likely action |
|---------|--------------|
| 2026 Census WPP published | Re-run W12A/W13 ingest with updated files |
| ABS TableBuilder access obtained | Evaluate 506-class ANZSIC granularity vs subdivision prompt |
| Prompt token budget increased | Include more subdivisions per division (currently top 6) |
| Subdivision-level employment profiles requested | Requires schema change — break Division-level routing assumption |

## References

- ADR-004: Australian data integration (FR-8.9 crosswalk, ANZSCO matching, employment distribution)
- ADR-005: Company-to-industry mapping (Haiku classification, GICS concordance, caching)
- ABS Census 2021: abs.gov.au/census (CC-BY 4.0)
- JSA Industry Data: jobsandskills.gov.au (November 2025 Revised)
