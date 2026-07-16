"""Deterministic content-drift checks — assert machine-checkable claims in the
docs still match the code.

Complements ``check_docs.py`` (broken links / orphans) with *content* accuracy:
row totals, frontend routes, endpoint/test/table counts. This is the layer that
would have caught the README drift fixed in PR #67 on the PR that introduced it.

stdlib-only (like ``check_redistribution.py``) so it runs in CI with no deps and
no database.

Severities:
  ERROR — structural, rarely-changing drift (routes, cross-doc row total). Fails
          CI so the doc gets fixed alongside the code change that moved it.
  WARN  — volatile counts (endpoints, tests, tables). Reported, never fails CI —
          otherwise every feature PR would nag until the doc is bumped.

Usage:
  python -m scripts.check_content_drift            # CI mode: exit 1 on any ERROR
  python -m scripts.check_content_drift --report   # print all findings, exit 0
                                                   # (used by the weekly review)
"""

from __future__ import annotations

import re
import sys
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
README = REPO / "README.md"
CLAUDE = REPO / "CLAUDE.md"
APP_TSX = REPO / "src" / "frontend" / "src" / "App.tsx"
API_DIR = REPO / "src" / "backend" / "app" / "api" / "v1"
MODELS_DIR = REPO / "src" / "backend" / "app" / "models"
BACKEND_TESTS = REPO / "src" / "backend" / "tests"
FE_SRC = REPO / "src" / "frontend" / "src"
E2E_DIR = REPO / "src" / "frontend" / "e2e"

# Routers excluded from the "public API" count the README cites (ops/plumbing).
NON_PUBLIC_ROUTERS = {"admin", "pipeline", "router", "schemas"}


@dataclass
class Finding:
    severity: str  # "ERROR" | "WARN"
    check: str
    message: str
    hint: str = ""


def _num(s: str) -> int:
    return int(s.replace(",", ""))


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8") if p.exists() else ""


def _count(paths: Iterable[Path], pattern: str) -> int:
    return sum(len(re.findall(pattern, _read(p))) for p in paths)


# ── Checks ──────────────────────────────────────────────────────────────────


def check_row_total() -> list[Finding]:
    """README's headline row total must equal CLAUDE.md's canonical TOTAL."""
    r = re.search(r"Data loaded \(~?([\d,]+)", _read(README))
    c = re.search(r"\*\*TOTAL\*\*\s*\|\s*\*\*~?([\d,]+)", _read(CLAUDE))
    if not r or not c:
        return [
            Finding("WARN", "row-total", "could not locate a row total in README and/or CLAUDE.md")
        ]
    if _num(r.group(1)) != _num(c.group(1)):
        return [
            Finding(
                "ERROR",
                "row-total",
                f"README total {r.group(1)} != CLAUDE.md TOTAL {c.group(1)}",
                "the two docs cite different canonical row counts — reconcile them",
            )
        ]
    return []


def _app_routes() -> tuple[set[str], set[str]]:
    """(real non-redirect routes, redirect-only routes) declared in App.tsx."""
    real: set[str] = set()
    redirect: set[str] = set()
    for m in re.finditer(r'<Route\s+path="([^"]+)"([^>]*)', _read(APP_TSX)):
        (redirect if "Navigate" in m.group(2) else real).add(m.group(1))
    return real, redirect


# Backtick `/...` spans that are NOT frontend routes (backend/OpenAPI/ops paths).
_NON_FE_PREFIXES = ("/api", "/docs", "/admin", "/pipeline", "/health")


def _readme_fe_routes() -> set[str]:
    """Frontend route code-spans in README (`/`, `/sectors`, … in backticks)."""
    out: set[str] = set()
    for m in re.finditer(r"`(/(?:[A-Za-z][\w:/-]*)?)`", _read(README)):
        p = m.group(1)
        if not any(p.startswith(x) for x in _NON_FE_PREFIXES):
            out.add(p.rstrip("/") or "/")
    return out


def check_routes() -> list[Finding]:
    real, redirect = _app_routes()
    documented = _readme_fe_routes()
    findings: list[Finding] = []
    if not real:
        return [Finding("WARN", "routes", "could not parse routes from App.tsx")]
    missing = real - documented
    if missing:
        findings.append(
            Finding(
                "ERROR",
                "routes",
                f"routes in App.tsx not documented in README: {sorted(missing)}",
                "add/repair these in the dashboard page table",
            )
        )
    dead = {d for d in documented if d not in (real | redirect)}
    if dead:
        findings.append(
            Finding(
                "ERROR",
                "routes",
                f"README documents routes absent from App.tsx: {sorted(dead)}",
                "these routes were removed/renamed — update the README",
            )
        )
    return findings


def check_endpoint_count() -> list[Finding]:
    m = re.search(r"Tier 1 API \(~?(\d+) public", _read(README))
    if not m:
        return [Finding("WARN", "endpoints", "could not parse the API endpoint count in README")]
    actual = sum(
        _count([f], r"@router\.(?:get|post|put|delete)")
        for f in sorted(API_DIR.glob("*.py"))
        if f.stem not in NON_PUBLIC_ROUTERS
    )
    claimed = int(m.group(1))
    if abs(claimed - actual) > 2:
        return [
            Finding(
                "WARN",
                "endpoints",
                f"README claims ~{claimed} public endpoints; code has {actual}",
                "update the API section count + table",
            )
        ]
    return []


def check_test_counts() -> list[Finding]:
    m = re.search(r"(\d+) backend \+ (\d+) component \+ (\d+) E2E", _read(README))
    if not m:
        return [Finding("WARN", "tests", "could not parse test counts in README")]
    claimed = {"backend": int(m.group(1)), "component": int(m.group(2)), "E2E": int(m.group(3))}
    actual = {
        "backend": _count(BACKEND_TESTS.glob("*.py"), r"(?m)^\s*(?:async\s+)?def test_"),
        "component": _count(FE_SRC.rglob("*.test.tsx"), r"(?m)^\s*(?:it|test)\("),
        "E2E": _count(E2E_DIR.glob("*.ts"), r"(?m)^\s*test\("),
    }
    findings: list[Finding] = []
    for kind, want in claimed.items():
        have = actual[kind]
        if have and abs(want - have) / have > 0.10:
            findings.append(
                Finding(
                    "WARN",
                    "tests",
                    f"README claims {want} {kind} tests; code has ~{have}",
                    "refresh the test counts",
                )
            )
    return findings


def check_table_count() -> list[Finding]:
    m = re.search(r"~(\d+) tables", _read(README))
    if not m:
        return [Finding("WARN", "tables", "could not parse a table count in README")]
    actual = _count(MODELS_DIR.glob("*.py"), r"(?m)^\s*__tablename__\s*=")
    claimed = int(m.group(1))
    if actual and abs(claimed - actual) > 4:
        return [
            Finding(
                "WARN",
                "tables",
                f"README says ~{claimed} tables; models declare {actual}",
                "refresh the table count",
            )
        ]
    return []


CHECKS: list[Callable[[], list[Finding]]] = [
    check_row_total,
    check_routes,
    check_endpoint_count,
    check_test_counts,
    check_table_count,
]


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "ERROR"]

    @property
    def warns(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "WARN"]


def run() -> Report:
    report = Report()
    for chk in CHECKS:
        report.findings.extend(chk())
    return report


def main() -> None:
    report_only = "--report" in sys.argv
    report = run()
    if not report.findings:
        print("content-drift: OK — docs match the code.")
        sys.exit(0)
    for f in report.findings:
        print(f"[{f.severity}] {f.check}: {f.message}")
        if f.hint:
            print(f"         -> {f.hint}")
    print(f"\ncontent-drift: {len(report.errors)} error(s), {len(report.warns)} warning(s).")
    sys.exit(1 if report.errors and not report_only else 0)


if __name__ == "__main__":
    main()
