"""Infrastructure models: dataset versioning (ADR-002) and transformation lineage (ADR-001)."""

from datetime import datetime

from sqlalchemy import Float, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DatasetVersion(Base):
    """Central version registry for all reference datasets (ADR-002).

    Every ingested version of O*NET, AEI, Eloundou, OEWS, or GPTVal gets
    a row here. Derived tables carry FK references back to this table,
    making provenance schema-enforced rather than optional metadata.
    """

    __tablename__ = "dataset_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_name: Mapped[str] = mapped_column(Text, nullable=False)
    version_key: Mapped[str] = mapped_column(Text, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(server_default=func.now())
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    integrity_hash: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)

    __table_args__ = (
        {"schema": None},
    )

    # UniqueConstraint defined in migration to keep model clean


class DatasetVersionDelta(Base):
    """Pre-computed diffs between dataset versions (ADR-002).

    Deltas are analytical products — "what changed between O*NET 28.0 and 28.1?"
    is a single query against this table.
    """

    __tablename__ = "dataset_version_deltas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_name: Mapped[str] = mapped_column(Text, nullable=False)
    from_version_id: Mapped[int | None] = mapped_column(Integer)
    to_version_id: Mapped[int] = mapped_column(Integer, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    records_added: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    records_removed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    records_changed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    delta_detail: Mapped[dict] = mapped_column(JSONB, nullable=False)


class TransformationLog(Base):
    """Lineage tracking for all derived computations (ADR-001).

    Populated by the @tracked_transformation decorator. Records source tables,
    target table, row counts, status, and version IDs per run.
    """

    __tablename__ = "transformation_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    source_tables: Mapped[list[str]] = mapped_column(
        # stored as JSONB array since ARRAY(Text) requires PostgreSQL-specific handling
        JSONB, nullable=False
    )
    target_table: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column()
    rows_affected: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="running")
    error_message: Mapped[str | None] = mapped_column(Text)
    parameters: Mapped[dict | None] = mapped_column(JSONB)
