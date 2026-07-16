"""Verify the static data tree matches the live API (P4 parity gate).

For a sample of keys, fetches the live Tier-1 API and the pre-rendered static
file for the same path, and deep-compares them (float-tolerant). Confirms the
static export (build_static_site.py) reproduces the API, and that the file-path
rule is correct. Run against a backend serving the SAME database the static
tree was built from.

Usage:
    # terminal 1: uvicorn app.main:app --port 8000   (same DB as build_static_site)
    # terminal 2:
    python -m scripts.verify_static_parity
    python -m scripts.verify_static_parity --api http://localhost:8000 --data ../frontend/public/data
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.build_static_site import _url_to_relpath  # noqa: E402  (reuse the one rule)

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATA = BACKEND_DIR.parent / "frontend" / "public" / "data"
FLOAT_TOL = 1e-6


def _fetch(api: str, path: str) -> Any:
    with urllib.request.urlopen(f"{api}/api/v1{path}", timeout=30) as r:
        return json.loads(r.read())


# US sectors have no ANZSIC subdivisions: the live API 404s, the static build
# deliberately ships an empty list so the adapter never misses a file. Not a
# parity claim — checked only for AU below.


def _diff(live: Any, static: Any, path: str = "") -> list[str]:
    """Deep compare; returns list of mismatch descriptions (empty = equal)."""
    if isinstance(live, float) or isinstance(static, float):
        if live is None or static is None:
            return [] if live == static else [f"{path}: {live!r} != {static!r}"]
        return (
            [] if abs(float(live) - float(static)) <= FLOAT_TOL else [f"{path}: {live} != {static}"]
        )
    if isinstance(live, dict) and isinstance(static, dict):
        out = []
        for k in set(live) | set(static):
            out += _diff(live.get(k), static.get(k), f"{path}.{k}")
        return out
    if isinstance(live, list) and isinstance(static, list):
        if len(live) != len(static):
            return [f"{path}: len {len(live)} != {len(static)}"]
        out = []
        for i, (a, b) in enumerate(zip(live, static)):
            out += _diff(a, b, f"{path}[{i}]")
        return out
    return [] if live == static else [f"{path}: {live!r} != {static!r}"]


def _sample_paths(data_dir: Path) -> list[str]:
    """Build a representative sample of url paths from the generated tree."""
    paths = [
        "/datasets",
        "/drift/summary",
        "/drift/departing?page=1&page_size=15",
        "/drift/below-threshold",
        "/drift/enduring?page=1&page_size=10",
        "/gdpval/summary",
        "/occupations/hierarchy",
        "/sectors?region=US",
        "/sectors?region=AU",
    ]
    # Sectors: priorities + subdivisions for every sector in both regions.
    for region in ("US", "AU"):
        sectors = json.loads((data_dir / _url_to_relpath(f"/sectors?region={region}")).read_text())
        for s in sectors["sectors"]:
            code = s["naics_code"]
            paths.append(f"/sectors/{code}/priorities?top_n=10&region={region}")
            if region == "AU":
                paths.append(f"/sectors/{code}/subdivisions")
    # 12 occupations spread across the SOC space: detail + matrix.
    hierarchy = json.loads((data_dir / "occupations" / "hierarchy.json").read_text())
    socs: list[str] = []

    def walk(nodes: list[dict[str, Any]]) -> None:
        for n in nodes:
            if n.get("level") == "occupation" or (not n.get("children") and "." in n["code"]):
                socs.append(n["code"])
            walk(n.get("children", []))

    walk(hierarchy["hierarchy"])
    for soc in socs[:: max(1, len(socs) // 12)][:12]:
        paths.append(f"/occupations/{soc}")
        paths.append(f"/occupations/{soc}/matrix")
        paths.append(f"/occupations/{soc}/bearings")
    # A few GDPval benchmark occupations.
    gdpval = json.loads((data_dir / "gdpval" / "summary.json").read_text())
    for occ in gdpval["occupations"][:6]:
        paths.append(f"/gdpval/occupations/{occ['soc_code']}")
    return paths


def run(api: str, data_dir: Path) -> int:
    paths = _sample_paths(data_dir)
    failures: list[str] = []
    for path in paths:
        static_file = data_dir / _url_to_relpath(path)
        if not static_file.exists():
            failures.append(f"{path}: MISSING static file {static_file.name}")
            continue
        live = _fetch(api, path)
        static = json.loads(static_file.read_text())
        mismatches = _diff(live, static)
        if mismatches:
            failures.append(f"{path}: {len(mismatches)} field(s) differ, first: {mismatches[0]}")

    print(
        f"Parity: checked {len(paths)} paths, {len(paths) - len(failures)} match, {len(failures)} differ."
    )
    for f in failures[:20]:
        print(f"  FAIL {f}")
    return 0 if not failures else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify static tree vs live API (P4)")
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--data", default=str(DEFAULT_DATA))
    args = parser.parse_args()
    sys.exit(run(args.api, Path(args.data)))


if __name__ == "__main__":
    main()
