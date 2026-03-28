---
date: 2026-03-29
status: accepted
agents: []
prd_section: FR-8.5
---

# LLM Classification Evaluation Methodology

## Context

The company classification feature (ADR-005) uses Claude Haiku to classify companies into ANZSIC divisions (AU) or NAICS sectors (US). Classification quality directly affects the consulting value of the platform — a misclassified company leads to irrelevant sector analysis and workforce impact assessments.

Two problems emerged during development:

1. **No systematic quality measurement** — classification was tested ad-hoc ("does AGL return D?") without regression protection or multi-sector detection validation.
2. **Model upgrade risk** — switching from Haiku 3.5 to Haiku 4.5 changed output format (JSON now wrapped in markdown fences) and classification behaviour. Without a baseline eval, the improvement couldn't be measured or regressions caught.

## Decision 1: Parametrized Company Evaluation Suite

### The choice

A pytest-parametrized test suite (`tests/test_au_classification.py`) with 10 ASX-listed companies spanning the diversity spectrum from pure-play operators to multi-sector conglomerates.

### Test case structure

Each company defines:
- `expected_primary: list[str]` — sector codes that **must** appear (hard assertion)
- `expected_any: list[str]` — at least one of these **should** appear (multi-sector detection)
- `not_expected: list[str]` — sector codes that **must not** appear (specificity validation)
- `max_sectors: int` — upper bound on sector count (for focused companies)
- `single_sector_asx: bool` — expected ASX lookup flag

### Company selection rationale

| Company | Why selected | Tests what |
|---------|-------------|-----------|
| AGL Energy | Diversified energy: generation + retail + gas + telco | Multi-sector detection for vertically integrated companies |
| AusNet Services | Pure infrastructure: distribution + transmission only | Correct single-sector for focused operators |
| Wesfarmers | Conglomerate: retail + chemicals + industrial | 3+ sector classification |
| Woolworths Group | Supermarkets + hospitality (Endeavour) | Secondary business line detection |
| Telstra | Dominant single-sector with minor diversification | Appropriate restraint (J alone is acceptable) |
| Qantas Airways | Transport + loyalty program + freight | Dominant sector with optional expansion |
| CSL Limited | Pharma manufacturing + health services | Cross-sector bridging (C+Q) |
| Macquarie Group | Financial services + infrastructure + energy | Dominant single-sector acceptable |
| Origin Energy | Energy + gas exploration (APLNG sold 2024) | Business change sensitivity |
| Transurban | Pure toll road infrastructure | Correct single-sector, max_sectors constraint |

### Rejected alternatives

1. **Manual spot-checking** — Not reproducible, no regression protection, doesn't scale with prompt changes.
2. **LLM-as-judge evaluation** — Meta-circular (using one LLM to judge another). Confidence scores from Haiku itself are useful but not sufficient for external validation.
3. **Crowdsourced human evaluation** — Too expensive for a 10-company suite. Human ground truth was used to *define* the test expectations, not to *run* the evaluation.

## Decision 2: Three-Tier Confidence Thresholds

### The choice

Classification results use a three-tier confidence system:

| Tier | Threshold | Action |
|------|-----------|--------|
| Auto-accept | confidence ≥ 0.85 | Cache and serve immediately |
| Needs review | 0.70 ≤ confidence < 0.85 | Cache but flag for potential manual review |
| Flagged | confidence < 0.60 | Excluded from results (prompt instructs: "only include sectors where confidence >= 0.6") |

### Rationale

The 0.60 floor prevents low-quality guesses from polluting the classification cache. The 0.85 auto-accept threshold aligns with the ANZSCO→SOC concordance matching (ADR-004, Decision 2) which uses the same threshold for auto-acceptance of semantic matches. Consistency across confidence thresholds reduces cognitive load.

The middle tier (0.70–0.85) exists because multi-sector detection often produces legitimate secondary sectors with moderate confidence — e.g., AGL's retail sector (G) at 0.75 is real but less dominant than its energy sector (D) at 0.95.

## Decision 3: Model Upgrade to Haiku 4.5

### The choice

Upgrade from `claude-3-haiku-20240307` to `claude-haiku-4-5-20251001` for the company classify endpoint.

### Measured impact

| Metric | Haiku 3.5 | Haiku 4.5 | Delta |
|--------|-----------|-----------|-------|
| Primary sector correct | 10/10 (100%) | 10/10 (100%) | No change |
| Multi-sector detection | 7/11 (64%) | 10/11 (91%) | +27pp |
| AGL sectors returned | `['D']` | `['D', 'G']` | +1 sector |
| AusNet sectors returned | `['D']` | `['D']` | Correctly unchanged |
| Origin sectors returned | `['D']` | `['D', 'J']` | +1 sector (telco) |

### Implementation fix required

Haiku 4.5 wraps JSON output in markdown code fences (` ```json ... ``` `). Added fence stripping in the response parser:

```python
if raw_text.startswith("```"):
    raw_text = raw_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
```

### Cost impact

Haiku 4.5 pricing is equivalent to Haiku 3.5 (~$0.001/call). No cost increase. Cache means each company is classified once regardless of model version.

## Decision 4: single_sector_asx Flag for Under-Classification Detection

### The choice

Add `single_sector_asx: bool` to `CompanySearchResult`. Set to `True` when an ASX lookup returns exactly 1 ANZSIC code (indicating the GICS→ANZSIC concordance lost multi-sector resolution).

### Rationale

The GICS→ANZSIC mapping is many-to-one at division level. "Utilities" → `['D']`, "Consumer Discretionary Distribution & Retail" → `['G']`. These single-code results are structurally under-classified for diversified companies. The flag lets the frontend suggest AI reclassification without the backend making UI decisions.

Companies with 2+ GICS→ANZSIC codes (e.g., BHP → `['B', 'C']`) get `single_sector_asx: False` and don't need reclassification.

## Decision 5: Workforce Profile on Classification Response

### The choice

After classification returns sector codes, load the blended Census W12A occupation mix across those sectors and return it as `workforce_profile` on `ClassifyResponse`. AU only — US returns `None`.

### Rationale

Classification alone gives codes and names. The workforce profile transforms the result into actionable intelligence: "Based on AGL's sectors (D+G), their workforce likely includes 21% Technicians, 21% Professionals, 16% Managers." This is the output a consulting engagement would present.

The mix is computed at query time (not cached) because Census data is static and the aggregation is trivial (~8 rows per sector × 3 sectors max).

## Consequences

**Benefits:**
- Regression-protected classification quality (10 companies, 19 total tests)
- Model upgrades can be measured before deployment (baseline → new → compare)
- `single_sector_asx` enables smart frontend UX without hardcoding business logic in the backend
- Workforce profile delivers immediate consulting value from the classify endpoint

**Trade-offs:**
- 10 companies is a small eval set — may miss edge cases in uncommon sectors
- LLM output is non-deterministic — the same company may classify slightly differently on re-run (mitigated by caching: each company is classified once)
- `single_sector_asx` may over-flag (some companies legitimately operate in exactly 1 sector)

**Risks:**
- Model deprecation: Low — Haiku 4.5 is current; model name is a single-line config change
- Eval drift: Medium — as the economy changes, test expectations may need updating (e.g., Origin sold APLNG → secondary sector shifted from B to J)
- Cache staleness: Low — classifications can be refreshed by re-calling the classify endpoint (ON CONFLICT upsert)

## Running the eval

```bash
# Non-LLM tests only (instant, no API key)
pytest tests/test_au_classification.py -m "not llm" -v

# Full LLM eval (~$0.01 in Haiku calls, requires ANTHROPIC_AUTH_TOKEN)
pytest tests/test_au_classification.py -m llm -v

# Clear cache and force fresh classification
DELETE FROM company_classifications WHERE region = 'AU';
pytest tests/test_au_classification.py -m llm -v
```

## Reassessment Triggers

| Trigger | Likely action |
|---------|--------------|
| New Haiku model version released | Re-run eval suite, compare accuracy, update model name if improved |
| Classification accuracy complaints from users | Add failing company to EVAL_CASES, diagnose, tune prompt |
| Eval suite falls below 90% multi-sector detection | Investigate prompt degradation or model regression |
| New AU sector added to ANZSIC | Update ANZSIC_DIVISIONS dict, add relevant test case |
| Economy-level business restructuring (M&A, divestment) | Update test expectations (e.g., Origin's APLNG sale changed secondary sector) |

## References

- ADR-005: Company-to-industry mapping (parent decision for classification feature)
- ADR-008: Census data integration and subdivision-enriched classification
- `tests/test_au_classification.py`: Full eval suite implementation
- `src/backend/app/api/v1/companies.py`: Classify endpoint with subdivision prompt
