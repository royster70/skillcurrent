# Validate Privacy Controls

Audits Tier 2 code for privacy compliance before writing tests or merging.

## Usage
```
/validate-privacy path="src/backend/dashboards/"
```

## What This Command Does

Delegates to the `privacy-reviewer` sub-agent to check:
- N≥5 enforcement on all aggregate queries
- Leaf node anonymisation applied at view level
- All dashboard queries using privacy views (not raw tables)
- RBAC scope rules correctly applied
- Audit logging present for all privacy-sensitive operations

Returns: PASS/FAIL per item with file + line references for any failures.

## When to Run
- After implementing any Tier 2 dashboard endpoint
- After adding any new query that touches the `employees` table
- Before writing integration tests for a Tier 2 feature
- As a pre-commit check for Tier 2 PRs

## Constraint
This command reads only — it does not modify any files. Fix issues manually after reviewing the report.
