"""Pre-publish redistribution gate (FR-9.5).

Validates the signal source registry CSV — the curated source of truth — WITHOUT
needing a database, so it can run in CI before any publish/export. It fails the
build if the redistribution boundary is violated:

  1. any source whose licence is citation-only / view-only / unverified is
     marked ``redistribution_ok = true`` (a leak of restricted data);
  2. any known consumed-only source is missing or wrongly flagged shippable;
  3. structural problems (missing columns, duplicate keys, blank licence).

Exit 0 = safe to publish; exit 1 = violations found (printed).

Usage:
    python -m scripts.check_redistribution
    python -m scripts.check_redistribution --path /some/other/dir
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

DATASET_DIR = Path(__file__).resolve().parent.parent / "data" / "signal_sources"
REQUIRED_COLUMNS = {
    "source_key",
    "source_name",
    "licence",
    "redistribution_ok",
}
_TRUE = {"true", "1", "yes", "y", "t"}

# Licence phrases that can NEVER be redistribution_ok = true.
RESTRICTED_MARKERS = (
    "citation",
    "cite-only",
    "cite only",
    "view-only",
    "view only",
    "not open",
    "not openly",
    "pending",
    "restricted",
    "proprietary",
    "unverified",
)

# Sources that MUST be present and flagged redistribution_ok = false (quarantine).
MUST_BE_RESTRICTED = {"aioe", "gdpval_aa", "openai_gdpval_scores", "sml_webb"}


def _is_true(value: str | None) -> bool:
    return (value or "").strip().lower() in _TRUE


def _read(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        header = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - header
        if missing:
            raise ValueError(f"{path.name}: missing columns {sorted(missing)}")
        return list(reader)


def check(data_dir: Path) -> list[str]:
    """Return a list of violation strings (empty = clean)."""
    files = sorted(p for p in data_dir.glob("*.csv") if not p.name.startswith("_"))
    if not files:
        return [f"no registry CSV found in {data_dir}"]

    violations: list[str] = []
    seen: set[str] = set()
    restricted_present: set[str] = set()

    for path in files:
        for i, row in enumerate(_read(path), start=2):
            key = (row.get("source_key") or "").strip()
            licence = (row.get("licence") or "").strip()
            ok = _is_true(row.get("redistribution_ok"))
            if not key:
                violations.append(f"{path.name} line {i}: blank source_key")
                continue
            if key in seen:
                violations.append(f"{path.name} line {i}: duplicate source_key '{key}'")
            seen.add(key)
            if not licence:
                violations.append(f"{key}: blank licence")
            low = licence.lower()
            if ok and any(m in low for m in RESTRICTED_MARKERS):
                violations.append(
                    f"{key}: licence '{licence}' is restricted but redistribution_ok=true "
                    f"(would leak cite-only data)"
                )
            if not ok:
                restricted_present.add(key)

    for key in sorted(MUST_BE_RESTRICTED - restricted_present):
        if key in seen:
            violations.append(f"{key}: must be redistribution_ok=false but is flagged true")
        else:
            violations.append(f"{key}: expected consumed-only source is missing from the registry")

    return violations


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-publish redistribution gate (FR-9.5)")
    parser.add_argument("--path", default=None, help="Override the dataset directory")
    args = parser.parse_args()
    data_dir = Path(args.path) if args.path else DATASET_DIR

    try:
        violations = check(data_dir)
    except (ValueError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    if violations:
        print("REDISTRIBUTION GATE FAILED — do not publish:", file=sys.stderr)
        for v in violations:
            print(f"  - {v}", file=sys.stderr)
        sys.exit(1)
    print("Redistribution gate OK — no restricted source is marked shippable.")


if __name__ == "__main__":
    main()
