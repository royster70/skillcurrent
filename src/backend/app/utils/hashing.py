"""Shared cryptographic hash utilities for data integrity verification (ADR-002)."""

import hashlib
import json
from pathlib import Path


def compute_file_hash(filepath: Path) -> str:
    """Compute SHA-256 of a single file's bytes."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def compute_files_hash(filepaths: list[Path]) -> str:
    """Compute a single SHA-256 from multiple files (sorted by name for determinism)."""
    sha256 = hashlib.sha256()
    for filepath in sorted(filepaths, key=lambda p: p.name):
        file_hash = compute_file_hash(filepath)
        sha256.update(file_hash.encode())
    return sha256.hexdigest()


def compute_bytes_hash(data: bytes) -> str:
    """Compute SHA-256 of raw bytes (for live downloads or in-memory data)."""
    return hashlib.sha256(data).hexdigest()


def compute_json_hash(obj: object) -> str:
    """Compute SHA-256 of a JSON-serialisable object (for static/derived data)."""
    serialised = json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(serialised).hexdigest()
