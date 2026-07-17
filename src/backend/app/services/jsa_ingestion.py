"""Ingest JSA "Our Gen AI Transition" AU-native exposure (Occupations_8.csv).

Source: Jobs and Skills Australia, "Our Gen AI Transition" (Aug 2025), CC BY 4.0.
714 rows, one per 4-digit ANZSCO unit group: augmentation + automation exposure
(each 0–1) plus supplementary skill-transition metrics.

Registers the version in dataset_versions (ADR-002) and is idempotent — clears
its own rows + version first. The platform's first published AU-native exposure
signal; kept as its own table, never blended with the bridge-derived
au_task_beta (CLAUDE.md invariant).
"""

import csv
import logging
from pathlib import Path

from sqlalchemy import delete, insert, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.infrastructure import DatasetVersion
from app.models.jsa import JsaGenaiExposure
from app.utils.hashing import compute_file_hash

logger = logging.getLogger(__name__)

_FILE = "Occupations_8.csv"
_SOURCE_URL = "https://www.jobsandskills.gov.au/reports/our-gen-ai-transition"

# CSV header column → model field. Positional-safe: we read by header name.
_COLUMNS: dict[str, str] = {
    "ANZSCO unit code": "anzsco_code",
    "ANZSCO unit title": "anzsco_title",
    "Occupation matrix group": "matrix_group",
    "Augmentation exposure score": "augmentation_score",
    "Automation exposure score": "automation_score",
    "Rate of skill change": "rate_of_skill_change",
    "Historical occupation mobility 2021-2022": "historical_mobility",
    "High-fit transition rate": "high_fit_transition_rate",
    "Hybridisation potential (differential score; scaled  x 1000)": "hybridisation_potential",
    "Specialisation potential (differential score; scaled x 1000)": "specialisation_potential",
    "Share of job ads that are entry level (%)": "entry_level_ad_share",
}
_FLOAT_FIELDS = set(_COLUMNS.values()) - {"anzsco_code", "anzsco_title", "matrix_group"}


def _num(raw: str | None) -> float | None:
    """Parse a JSA cell to float; JSA marks missing values as ' - '."""
    if raw is None:
        return None
    s = raw.strip()
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse(path: Path) -> list[dict[str, object]]:
    """Parse Occupations_8.csv to one row per 4-digit ANZSCO code.

    The file lists each occupation TWICE — once under matrix group "All
    occupations" and once under its specific group — with identical
    augmentation/automation scores (the exposure is a per-occupation property,
    the matrix group is only a categorisation). We keep one row per code,
    preferring the specific group over the generic "All occupations".
    """
    by_code: dict[str, dict[str, object]] = {}
    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for raw in reader:
            rec: dict[str, object] = {}
            for header, field in _COLUMNS.items():
                val = raw.get(header)
                if field in _FLOAT_FIELDS:
                    rec[field] = _num(val)
                else:
                    rec[field] = (val or "").strip() or None
            code = rec.get("anzsco_code")
            if not code:  # skip footnote/blank rows
                continue
            code = str(code)
            rec["anzsco_code"] = code
            existing = by_code.get(code)
            # Keep the first specific-group row; only let "All occupations"
            # win if nothing more specific has been seen yet.
            if existing is None or existing.get("matrix_group") == "All occupations":
                by_code[code] = rec
    return list(by_code.values())


async def ingest_jsa_genai(session: AsyncSession, data_path: str, version: str = "2025.08") -> int:
    """Ingest Occupations_8.csv into jsa_genai_exposure. Returns rows loaded."""
    fp = Path(data_path) / _FILE
    if not fp.exists():
        raise FileNotFoundError(f"JSA Gen AI file missing: {fp}")

    integrity_hash = compute_file_hash(fp)
    records = _parse(fp)
    for rec in records:
        rec["jsa_version"] = version

    # Idempotent: clear this version's rows + version row first.
    await session.execute(delete(JsaGenaiExposure).where(JsaGenaiExposure.jsa_version == version))
    await session.execute(
        delete(DatasetVersion).where(
            DatasetVersion.dataset_name == "jsa_genai", DatasetVersion.version_key == version
        )
    )
    await session.execute(
        insert(DatasetVersion).values(
            dataset_name="jsa_genai",
            version_key=version,
            row_count=len(records),
            integrity_hash=integrity_hash,
            source_url=_SOURCE_URL,
            metadata_={"file": _FILE, "grain": "ANZSCO 4-digit unit group"},
        )
    )
    if records:
        await session.execute(insert(JsaGenaiExposure), records)

    # Mark the source loaded in the redistribution registry (was 'acquired').
    await session.execute(
        text("UPDATE signal_source_registry SET status = 'loaded' WHERE source_key = 'jsa_genai'")
    )

    logger.info("Ingested %d JSA Gen AI rows (version %s)", len(records), version)
    return len(records)
