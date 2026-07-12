#!/usr/bin/env python3
"""Documentation reachability check (stdlib only, no deps).

Two gates, run locally or in CI:

  1. BROKEN LINKS  — every `](path.md)` link in any tracked markdown file must
     resolve to a file that exists. Broken links are always a bug.
  2. ORPHANED DOCS — every doc under `docs/` and `ai_working/decisions/` must be
     reachable by following markdown links transitively from the entry points
     (README.md, CLAUDE.md). A doc no one can navigate to is as good as missing.

Intentional exceptions are listed in ORPHAN_ALLOWLIST with a reason. Anything
else that becomes unreachable fails the check — findability stops being a
periodic manual sweep and becomes a gate.

Usage:  python scripts/check_docs.py            # from repo root
Exit:   0 = clean · 1 = issues found
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# Entry points from which reachability is measured.
ROOTS = ["README.md", "CLAUDE.md"]

# Directories whose docs must be reachable from the roots.
GUARDED_DIRS = ["docs", "ai_working/decisions"]

# Trees that are never "project docs" (config, ephemeral notes, vendored).
EXCLUDE_PARTS = {
    ".git",
    ".venv",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    ".claude",
    "ai_working/context",
}

# Known, intentional orphans — {relative path: reason}. Anything not here fails.
ORPHAN_ALLOWLIST: dict[str, str] = {
    "docs/documentation.md": "stray agent-prompt file misplaced in docs/ — cleanup candidate (move to .claude/agents or remove)",
}

# Clickable markdown links — only these can be "broken".
_MD_LINK = re.compile(r"\]\(([^)]+?\.md)(?:#[^)]*)?\)")
# Backtick code paths — CLAUDE.md references docs this way; still "findable".
_CODE_PATH = re.compile(r"`([A-Za-z0-9_./-]+?\.md)`")


def _excluded(path: Path) -> bool:
    rel = path.relative_to(REPO).as_posix()
    return any(part in rel.split("/") or rel.startswith(part + "/") for part in EXCLUDE_PARTS)


def _md_links(md: Path) -> list[str]:
    """Clickable markdown-link targets (used for broken-link detection)."""
    text = md.read_text(encoding="utf-8", errors="ignore")
    return [m.group(1).strip() for m in _MD_LINK.finditer(text)]


def _resolve(src: Path, link: str) -> Path | None:
    if link.startswith(("http://", "https://", "mailto:")):
        return None
    return (src.parent / link).resolve()


def _referenced_targets(md: Path) -> set[Path]:
    """Existing docs this file references — via markdown link (file-relative) OR
    backtick code path (repo-root or file-relative). Used for reachability."""
    text = md.read_text(encoding="utf-8", errors="ignore")
    out: set[Path] = set()
    for link in (m.group(1).strip() for m in _MD_LINK.finditer(text)):
        tgt = _resolve(md, link)
        if tgt is not None and tgt.exists():
            out.add(tgt)
    for code in (m.group(1).strip() for m in _CODE_PATH.finditer(text)):
        for cand in ((REPO / code).resolve(), (md.parent / code).resolve()):
            if cand.exists():
                out.add(cand)
    return out


def main() -> int:
    all_md = [p for p in REPO.rglob("*.md") if not _excluded(p)]
    broken: list[str] = []
    for md in all_md:
        for link in _md_links(md):
            tgt = _resolve(md, link)
            if tgt is not None and not tgt.exists():
                broken.append(f"{md.relative_to(REPO).as_posix()} -> {link}")

    # Transitive reachability from the roots (markdown links + backtick paths).
    reachable: set[Path] = set()
    queue = [(REPO / r).resolve() for r in ROOTS]
    while queue:
        cur = queue.pop()
        if cur in reachable or not cur.exists():
            continue
        reachable.add(cur)
        for tgt in _referenced_targets(cur):
            if tgt not in reachable:
                queue.append(tgt)

    guarded = [p for d in GUARDED_DIRS for p in (REPO / d).rglob("*.md") if not _excluded(p)]
    orphans: list[str] = []
    for p in guarded:
        rel = p.relative_to(REPO).as_posix()
        if p.resolve() not in reachable and rel not in ORPHAN_ALLOWLIST:
            orphans.append(rel)

    ok = not broken and not orphans
    print(
        f"Docs reachability: scanned {len(all_md)} markdown files; "
        f"{len(guarded)} guarded docs — {len(orphans)} orphan(s), "
        f"{len(set(broken))} broken link(s). (roots: {', '.join(ROOTS)})"
    )
    if broken:
        print(f"\n  {len(broken)} BROKEN LINK(S):")
        for b in sorted(set(broken)):
            print(f"    - {b}")
    if orphans:
        print(f"\n  {len(orphans)} ORPHANED DOC(S) (unreachable from entry points):")
        for o in sorted(orphans):
            print(f"    - {o}   (link it, or add to ORPHAN_ALLOWLIST with a reason)")
    if ORPHAN_ALLOWLIST:
        print(f"\n  {len(ORPHAN_ALLOWLIST)} allowlisted orphan(s):")
        for k, why in ORPHAN_ALLOWLIST.items():
            print(f"    - {k}  — {why}")
    print("\nOK" if ok else "\nFAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
