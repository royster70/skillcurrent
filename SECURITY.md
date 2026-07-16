# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, use
GitHub's private vulnerability reporting:

> **Security** tab → **Report a vulnerability** (GitHub Security Advisories)

That opens a private channel with the maintainers. We aim to acknowledge a
report within a few days.

## What counts as a security issue here

SkillCurrent is a read-only analytics platform over public data, so the usual
"account takeover" surface is small. The issues we most want to hear about:

- **Data-redistribution leaks** — the platform must never ship a source marked
  `redistribution_ok = false` in `signal_source_registry` (e.g. `asx_gics`,
  `aioe`). If you find a restricted source's data in the seed, a published
  static export, or an API response, that's a licensing/security issue — report
  it privately.
- **Secret exposure** — a credential (API key, token) committed to history, or
  printed in logs/telemetry.
- **Injection / auth** in the Tier-2 code paths (RBAC, privacy views) if/when
  they land — see `docs/security.md`.
- Standard web vulnerabilities in the API or frontend.

## Supported versions

The project is pre-1.0; only the `master` branch is supported. Fixes land on
`master` and flow to the deployed static site on the next release.
