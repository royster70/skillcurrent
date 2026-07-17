"""CLI to capture a snapshot / cut a release of the derived readings (ADR-012).

Two modes:
  · ad-hoc capture — the terminal `snapshot_derived_products` pipeline stage
    calls this with no args, so every recompute leaves a reading.
  · release cut (`--release`) — a quarterly data release tied to the
    dataset_versions register: a labelled is_release snapshot plus the
    dataset-version delta since the last release. Guarded — skips if the
    register is unchanged, unless `--force`.

Usage:
    python -m scripts.capture_snapshot                          # ad-hoc, today
    python -m scripts.capture_snapshot --release                # cut this quarter's release
    python -m scripts.capture_snapshot --release --label 2026-Q3
    python -m scripts.capture_snapshot --release --force        # cut even if data unchanged
"""

import argparse
import asyncio
import logging
from typing import cast

from app.db.session import async_session
from app.services.snapshot_capture import capture_snapshot, cut_release

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)


async def run(
    as_of_iso: str | None = None,
    label: str | None = None,
    is_release: bool = False,
    force: bool = False,
) -> int:
    """Capture a snapshot, or cut a release when ``is_release``. Returns the
    number of verdict rows written (0 if a release was skipped)."""
    async with async_session() as session:
        if is_release:
            result = await cut_release(session, as_of_iso=as_of_iso, label=label, force=force)
            await session.commit()
            if result.get("skipped"):
                print(f"\nRelease {result['label']} skipped — {result['reason']}.")
                return 0
            print(
                f"\nRelease {result['label']} cut: {result['rows']:,} verdict rows, "
                f"{result['dataset_deltas']} dataset-version delta(s)."
            )
            return cast(int, result["rows"])
        rows = await capture_snapshot(session, as_of_iso=as_of_iso, label=label)
        await session.commit()
    print(f"\nSnapshot captured: {rows:,} verdict rows")
    return rows


async def main(as_of_iso: str | None, label: str | None, is_release: bool, force: bool) -> None:
    await run(as_of_iso=as_of_iso, label=label, is_release=is_release, force=force)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Capture a snapshot / cut a release")
    parser.add_argument("--as-of", dest="as_of", default=None, help="ISO date (default: today)")
    parser.add_argument("--label", default=None, help="Label (default: quarter for a release)")
    parser.add_argument("--release", action="store_true", help="Cut a data release")
    parser.add_argument(
        "--force", action="store_true", help="Cut the release even if the register is unchanged"
    )
    args = parser.parse_args()
    asyncio.run(main(args.as_of, args.label, args.release, args.force))
