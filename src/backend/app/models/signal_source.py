"""Signal source registry (FR-9.5) — the open-source redistribution gate.

One row per external data source with a machine-readable ``redistribution_ok``
flag. Drives the seed-inclusion filter and the pre-publish check
(``scripts/check_redistribution.py``), replacing the prose rules in ``NOTICE``
and ``docs/data-sources.md`` with a queryable table. Tier-1 reference data
(public sources only).
"""

from datetime import datetime

from sqlalchemy import Boolean, Index, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SignalSource(Base):
    """One external data source and whether it may be redistributed."""

    __tablename__ = "signal_source_registry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_key: Mapped[str] = mapped_column(Text, nullable=False)
    source_name: Mapped[str] = mapped_column(Text, nullable=False)
    publisher: Mapped[str | None] = mapped_column(Text)
    dataset: Mapped[str | None] = mapped_column(Text)
    licence: Mapped[str] = mapped_column(Text, nullable=False)
    redistribution_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    native_grain: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    registry_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="2026.07.1")
    integrity_hash: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("source_key", name="uq_signal_source_registry_source_key"),
        Index("ix_signal_source_registry_redistribution_ok", "redistribution_ok"),
    )
