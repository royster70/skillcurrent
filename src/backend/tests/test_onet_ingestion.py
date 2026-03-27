"""Tests for O*NET ingestion utilities.

Tests the file reading, type casting, and hash computation
functions from app.services.onet_ingestion.
"""

from pathlib import Path

import pandas as pd
import pytest

from app.services.onet_ingestion import (
    _NUMERIC_COLS,
    _TASK_RATING_COLS,
    _read_onet_file,
)
from app.utils.hashing import compute_files_hash


def _write_tsv(path: Path, filename: str, header: str, rows: list[str]) -> Path:
    """Helper to write a temp TSV file."""
    filepath = path / filename
    content = header + "\n" + "\n".join(rows) + "\n"
    filepath.write_text(content, encoding="utf-8")
    return filepath


async def test_read_onet_file_dtypes(tmp_path: Path):
    """_read_onet_file reads all columns as string then casts numerics correctly.

    Creates a small temp TSV with known values including empty entries
    and verifies type handling.
    """
    header = "O*NET-SOC Code\tTask ID\tScale ID\tCategory\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tDate\tDomain Source"
    rows = [
        "15-1252.00\t12345\tIM\t3\t3.45\t20\t0.12\t3.21\t3.69\tN\t07/2024\tAnalyst",
        "15-1252.00\t12346\tIM\t\t\t\t\t\t\tY\t07/2024\tAnalyst",
    ]
    _write_tsv(tmp_path, "Task Ratings.txt", header, rows)

    df = _read_onet_file(tmp_path, "Task Ratings.txt", _TASK_RATING_COLS)

    # Check row count
    assert len(df) == 2

    # First row: numeric columns should be properly cast
    assert df.iloc[0]["task_id"] == 12345
    assert df.iloc[0]["data_value"] == pytest.approx(3.45)
    assert df.iloc[0]["n"] == 20
    assert df.iloc[0]["standard_error"] == pytest.approx(0.12)

    # String columns stay as strings
    assert df.iloc[0]["onet_soc"] == "15-1252.00"
    assert df.iloc[0]["scale_id"] == "IM"
    assert df.iloc[0]["recommend_suppress"] == "N"

    # Second row: task_id is still present, but empty numeric cols become NaN/NA
    assert df.iloc[1]["task_id"] == 12346
    assert pd.isna(df.iloc[1]["category"]) or df.iloc[1]["category"] is None
    assert pd.isna(df.iloc[1]["data_value"])
    assert pd.isna(df.iloc[1]["n"])


async def test_numeric_cols_registry():
    """All expected numeric columns are in _NUMERIC_COLS."""
    expected_float = {"data_value", "standard_error", "lower_ci_bound", "upper_ci_bound"}
    expected_int = {"task_id", "incumbents_responding", "n"}

    for col in expected_float:
        assert col in _NUMERIC_COLS, f"Missing float column: {col}"
        assert _NUMERIC_COLS[col] == "float", f"{col} should be float, got {_NUMERIC_COLS[col]}"

    for col in expected_int:
        assert col in _NUMERIC_COLS, f"Missing int column: {col}"
        assert _NUMERIC_COLS[col] == "int", f"{col} should be int, got {_NUMERIC_COLS[col]}"


async def test_compute_dataset_hash_deterministic(tmp_path: Path):
    """Same files produce the same hash; different content produces different hash."""
    content = "Col1\tCol2\nval1\tval2\n"
    (tmp_path / "file_a.txt").write_text(content, encoding="utf-8")
    (tmp_path / "file_b.txt").write_text(content, encoding="utf-8")

    paths = [tmp_path / "file_a.txt", tmp_path / "file_b.txt"]

    hash1 = compute_files_hash(paths)
    hash2 = compute_files_hash(paths)
    assert hash1 == hash2, "Same files should produce the same hash"

    # Modify one file — hash should change
    (tmp_path / "file_a.txt").write_text("Col1\tCol2\nchanged\tdata\n", encoding="utf-8")
    hash3 = compute_files_hash(paths)
    assert hash3 != hash1, "Different file content should produce a different hash"
