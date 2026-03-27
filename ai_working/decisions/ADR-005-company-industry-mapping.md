---
date: 2026-03-26
status: accepted
agents: []
prd_section: FR-8.5
---

# Company-to-Industry Mapping — ASX Lookup, LLM Classification, and Concordance Strategy

## Context

FR-8.5 adds a company lookup feature to the Tier 1 dashboard, allowing users to search for a company and navigate directly to the relevant sector analysis. The feature must handle two distinct populations:

1. **ASX-listed companies** — ~2,000 publicly listed Australian companies with GICS industry classification, covering the majority of large employers that advisory clients ask about.
2. **Unlisted/SME companies** — the long tail of private companies, startups, and small businesses not in any structured registry with industry classification depth.

The integration presents five architectural decisions spanning lookup strategy, classification concordance, LLM usage, navigation UX, and UI placement.

### Constraints

- The platform standardises on NAICS (US) and ANZSIC (AU) for employment weighting and sector analysis. Any company classification must ultimately resolve to one of these taxonomies.
- ASX uses GICS (Global Industry Classification Standard), which is incompatible with NAICS/ANZSIC without a concordance layer.
- LLM classification requires an API key and incurs per-call cost. The feature must degrade gracefully when the key is absent.
- The existing composite sector endpoint requires 2+ sectors. Single-sector companies must not be routed there.

## Decision 1: ASX + LLM Hybrid Strategy

### The choice

Two-layer approach — ASX listed companies (1,978 rows) for instant lookup via pg_trgm fuzzy search, plus Claude Haiku LLM classification for unlisted/SME companies.

### Rejected alternatives

1. **LLM-only** — Too slow (~2s per call) and too expensive for every lookup. Users searching for BHP or Woolworths should get instant results, not wait for an API round-trip.
2. **Manual curation** — Maintaining a comprehensive company-to-industry mapping does not scale. New companies list, delist, and change sectors regularly.
3. **ABN Lookup API** — Provides business registration data but no industry classification depth. ANZSIC codes in the ABR are self-reported and unreliable.

### Rationale

- ASX covers ~80% of enterprise advisory use cases (large employers are predominantly listed companies). Instant pg_trgm search provides sub-100ms response times.
- The LLM layer handles the long tail — any company name can be classified into NAICS/ANZSIC sectors with confidence scores.
- The `company_classifications` cache table prevents repeat API calls. Each company is classified once, then served from cache.
- Zero changes needed to downstream composite sector endpoint — the lookup produces standard NAICS/ANZSIC sector codes that feed directly into existing sector analysis.

## Decision 2: GICS to ANZSIC to NAICS Concordance Chain

### The choice

Hardcoded concordance dict in the ingestion script mapping 24 GICS Industry Groups to ANZSIC division letters, then reverse-lookup NAICS via the existing `industry_crosswalk` table (built in FR-8.9).

### Rejected alternatives

1. **Using GICS codes directly** — Incompatible with the rest of the platform, which standardises on NAICS/ANZSIC for employment weighting. Would require a parallel code path for GICS-sourced companies.
2. **ABR industry codes** — Self-reported and unreliable. Many ABR entries have stale or generic ANZSIC codes.

### Rationale

- GICS is the ASX standard classification. ANZSIC is the AU government standard. The concordance is stable (GICS Industry Groups rarely change) and small enough (24 entries) to maintain manually.
- The two-hop chain (GICS to ANZSIC to NAICS) reuses the FR-8.9 crosswalk infrastructure. No new tables or join paths needed.

### Limitation acknowledged

GICS to ANZSIC mapping is many-to-one at division level, losing sector depth. Diversified companies (e.g., Wesfarmers spans retail, chemicals, industrial; AGL spans energy, retail) get mapped to their dominant sector, not all business lines. This is a structural limitation of using ANZSIC 2006 division-level classification (only 19 divisions).

## Decision 3: LLM Classification with Structured Output

### The choice

Claude Haiku (claude-haiku-4-5-20251001) with a structured JSON prompt returning 1-3 sector codes with confidence scores, cached in the `company_classifications` table.

### Rejected alternatives

1. **Claude Sonnet** — Too expensive for a classification task. Haiku at ~$0.001/call is appropriate for 19-category (ANZSIC) or 20-category (NAICS) classification.
2. **Fine-tuned model** — Overkill for a small-cardinality classification problem. The prompt includes full sector descriptions, which is sufficient context for Haiku.
3. **Web scraping company websites** — Unreliable, slow, and raises legal/ToS concerns. Many company websites do not clearly state their industry classification.

### Rationale

- Haiku is fast (<2s) and cheap (~$0.001/call). The prompt includes all 19 ANZSIC division descriptions for AU or 20 NAICS sector descriptions for US, giving the model sufficient context.
- Confidence threshold (>=0.6) filters low-quality results. Classifications below this threshold are returned but flagged.
- Cache means each company is classified once. Subsequent lookups for the same company are instant.

### Trade-off

Requires `ANTHROPIC_API_KEY` in the backend `.env` file. Graceful degradation: ASX search works without the key; only the "Classify with AI" button requires it. The UI disables the classify action and shows a message when the key is absent.

Credential management uses Pydantic Settings (not raw `os.environ.get`) to load the key from `.env` in the backend working directory.

## Decision 4: Single-Sector Navigation Path

### The choice

When a company maps to exactly 1 sector, navigate directly to the sector detail page (`/sectors/{code}`). Only multi-sector companies (2+ sectors) go to the composite view (`/sectors/composite?codes=...`).

### Rejected alternatives

1. **Always navigate to composite** — The composite endpoint validates that at least 2 sector codes are provided and returns 400 for a single code. Routing single-sector companies there created a dead-end.
2. **Require manual confirmation** — Adding a confirmation step before navigation increased friction without adding value.

### Rationale

Discovered during testing: single-sector companies (the majority of ASX listings) were hitting the composite view and receiving an error. The fix routes single-sector results directly to sector detail, which provides the full analysis without requiring a multi-sector aggregation. Multi-sector companies (from LLM classification returning 2-3 sectors) naturally route to composite.

## Decision 5: Company Lookup as Collapsible Card (Not Modal or Page)

### The choice

Collapsible card on `SectorsPage`, integrated between the ZoneExplainer and SectorChipSelector components. Purple accent theme. Collapsed by default.

### Rejected alternatives

1. **Separate page** — Breaks the sector browsing flow. Users would need to navigate away from the sectors list to look up a company, then navigate back.
2. **Modal dialog** — Blocks interaction with the underlying sector list. Users cannot compare company lookup results with the visible sector chips.
3. **Sidebar panel** — Consumes horizontal space on every page load, even when unused.

### Rationale

- Low friction — users can discover the lookup while browsing sectors. No navigation required.
- Does not interrupt the existing manual sector selection workflow (SectorChipSelector remains fully functional).
- Purple theme distinguishes it from AEI (green) and GDPval (burnt orange) panels, maintaining the platform's visual vocabulary for different data sources.
- Collapsed by default means zero visual overhead for users who prefer manual sector selection.

## Known Limitation: Australian Industry Classification Depth

ANZSIC 2006 has only 19 divisions — far too coarse for diversified companies. ASX GICS provides better sector granularity (24 Industry Groups, 69 Industries) but the platform standardises on NAICS/ANZSIC for employment weighting.

LLM classification inherits this limitation — it can only classify into the 19 ANZSIC divisions (AU) or 20 NAICS sectors (US) available in the platform.

Future improvement: sub-division ANZSIC classes (506 available) would give much better resolution but require ABS employment data at class level. This data is available via ABS TableBuilder but requires registration and manual export — not freely downloadable like the JSA Occupation Profiles used for the current 19-division integration.

## Implementation

### Database

```sql
-- ASX company lookup (ingested from ASX listing data)
CREATE TABLE asx_company_sectors (
    id              SERIAL PRIMARY KEY,
    company_name    TEXT NOT NULL,
    asx_code        TEXT,
    gics_group      TEXT,
    anzsic_code     TEXT,
    naics_code      TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_asx_company_trgm ON asx_company_sectors
    USING gin (company_name gin_trgm_ops);

-- LLM classification cache
CREATE TABLE company_classifications (
    id              SERIAL PRIMARY KEY,
    company_name    TEXT NOT NULL,
    region          TEXT NOT NULL,
    sectors         JSONB NOT NULL,
    model_used      TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

### API endpoints

- `GET /api/v1/companies/search?q=...&region=AU` — pg_trgm fuzzy search against `asx_company_sectors`, returns matching companies with ASX codes and sector mappings
- `POST /api/v1/companies/classify` — LLM classification via Claude Haiku, accepts `{company_name, region}`, returns 1-3 sector codes with confidence scores, cached

### Frontend

`CompanyLookup.tsx` — collapsible card component with:
- Debounced search input (300ms)
- ASX code badges on search results
- "Classify with AI" button for unlisted companies
- Smart navigation: 1 sector to detail, 2+ sectors to composite

### Ingestion

`ingest_asx_companies.py` — loads ASX company data with GICS to ANZSIC to NAICS concordance chain. 1,978 companies ingested.

## Consequences

**Benefits:**
- Instant lookup for ~80% of enterprise advisory use cases (ASX-listed companies)
- LLM classification handles the long tail without manual curation
- Cache prevents repeat API costs
- Reuses FR-8.9 crosswalk infrastructure for concordance
- Zero changes to downstream sector analysis endpoints
- Graceful degradation without ANTHROPIC_API_KEY

**Trade-offs:**
- ANZSIC division-level classification is too coarse for diversified companies
- GICS to ANZSIC concordance is many-to-one, losing sector granularity
- LLM classification requires an API key and incurs per-call cost (mitigated by caching)
- ASX data covers Australian listed companies only — US company lookup relies entirely on LLM classification

**Risks:**
- ASX listing data staleness: Low — can be refreshed periodically; company sector changes are infrequent
- GICS revision: Low — GICS Industry Groups are revised approximately every 5 years; concordance dict is small and manually maintainable
- Anthropic API deprecation of Haiku model: Low — model name is configurable; replacement models maintain the same API interface

## Reassessment Triggers

| Trigger | Likely action |
|---------|--------------|
| Sub-division ANZSIC data obtained (ABS TableBuilder) | Expand LLM classification to 506 ANZSIC classes |
| US company registry integration requested | Add SEC/EDGAR or D&B data source alongside LLM |
| Haiku model deprecated | Update model name in configuration; test classification quality |
| Classification accuracy concerns raised | Add human review workflow for cached classifications |
| High LLM API volume | Consider batch classification or pre-classification of common company names |

## Implementation Notes

Discrepancies between this ADR and the shipped implementation (verified 2026-03-27):

1. **Model version**: Decision 3 states "claude-haiku-4-5-20251001" but the implementation in `companies.py` uses `claude-3-haiku-20240307`. The older Haiku model was used for initial development; model name is a single-line change when upgrading.

2. **`company_classifications` schema**: The ADR shows `company_name TEXT`, `sectors JSONB`, and `model_used TEXT`. The actual table uses `company_name_lower TEXT` (normalised to lowercase for case-insensitive cache lookup), `sector_codes TEXT[]` and `sector_names TEXT[]` (PostgreSQL arrays instead of JSONB), `confidence FLOAT`, and omits `model_used`. The array-based design is simpler for the downstream SQL queries that filter by sector code.

3. **Classify request field name**: The ADR endpoint description says the request body accepts `{company_name, region}`. The Pydantic `ClassifyRequest` model uses `{name, region}` — shorter field name in the API contract.

4. **`asx_company_sectors` schema**: The ADR shows singular `anzsic_code TEXT` and `naics_code TEXT` columns. The actual table uses `anzsic_codes TEXT[]` and `naics_codes TEXT[]` (arrays) to support companies mapped to multiple sectors through the GICS concordance.

These are implementation refinements that improved the working code. The architectural decisions (hybrid ASX+LLM strategy, GICS concordance chain, caching, single-sector navigation, collapsible card UX) are all implemented as specified.

## References

- ADR-004: Australian data integration (FR-8.9 crosswalk infrastructure reused here)
- CLAUDE.md: FR-8.5 feature description and build dependency chain
- ASX company data: asx.com.au
- GICS classification: msci.com/gics
