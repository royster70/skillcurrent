"""OSCA 2024 occupation backbone (FR-9.1, Phase A).

The Australian Occupation Standard Classification (OSCA 2024 v1.0, ABS) is the
canonical AU occupation entity, superseding the retired ANZSCO. ANZSCO is kept
as a legacy key during the dual-key transition via ``OscaAnzscoMap``.

OSCA main tasks are GenAI-generated, broad, and carry no O*NET/DWA linkage —
they are ``descriptor_only`` and never an exposure carrier. Task-level exposure
is carried by the ASC specialist task (see app/models/asc.py, FR-9.2). See the
"AU task-level crosswalk & confidence" section of docs/domain-model.md.
"""

from datetime import datetime

from sqlalchemy import Boolean, Float, Index, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OscaOccupation(Base):
    """OSCA occupation (6-digit canonical AU key)."""

    __tablename__ = "osca_occupations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    osca_code: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    isco08_code: Mapped[str | None] = mapped_column(Text)
    unit_group: Mapped[str | None] = mapped_column(Text)
    osca_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="2024.1.0")
    integrity_hash: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("osca_code", "osca_version", name="uq_osca_occupations_code_version"),
        Index("ix_osca_occupations_code", "osca_code"),
        Index("ix_osca_occupations_isco", "isco08_code"),
    )


class OscaMainTask(Base):
    """OSCA main task — descriptor / validation only, never carries task exposure."""

    __tablename__ = "osca_main_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    osca_code: Mapped[str] = mapped_column(Text, nullable=False)
    task_id: Mapped[str | None] = mapped_column(Text)
    task_text: Mapped[str] = mapped_column(Text, nullable=False)
    descriptor_only: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    osca_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="2024.1.0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (Index("ix_osca_main_tasks_code", "osca_code"),)


class OscaAnzscoMap(Base):
    """OSCA <-> ANZSCO official correspondence (dual-key bridge).

    ``relation_type`` and ``weight`` preserve many-to-many splits explicitly so
    downstream employment apportionment never collapses them silently.
    """

    __tablename__ = "osca_anzsco_map"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    osca_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_code: Mapped[str] = mapped_column(Text, nullable=False)
    correspondence_type: Mapped[str | None] = mapped_column(Text)
    relation_type: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[float | None] = mapped_column(Float)
    osca_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="2024.1.0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("osca_code", "anzsco_code", "osca_version", name="uq_osca_anzsco_map"),
        Index("ix_osca_anzsco_osca", "osca_code"),
        Index("ix_osca_anzsco_anzsco", "anzsco_code"),
    )


class OscaIscoMap(Base):
    """OSCA <-> ISCO-08 official correspondence (occupation-level pivot for gap-fill)."""

    __tablename__ = "osca_isco_map"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    osca_code: Mapped[str] = mapped_column(Text, nullable=False)
    isco08_code: Mapped[str] = mapped_column(Text, nullable=False)
    correspondence_type: Mapped[str | None] = mapped_column(Text)
    relation_type: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[float | None] = mapped_column(Float)
    osca_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="2024.1.0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("osca_code", "isco08_code", "osca_version", name="uq_osca_isco_map"),
        Index("ix_osca_isco_osca", "osca_code"),
        Index("ix_osca_isco_isco", "isco08_code"),
    )


class AbsEmploymentOsca(Base):
    """AU employment apportioned ANZSCO -> OSCA (ADR-010).

    ``link_method``: full (1:1 exact) | apportioned_equal (split, no finer data) |
    apportioned_employment (split weighted by held employment). Apportioned
    employment reconciles to the de-duplicated ANZSCO base.
    """

    __tablename__ = "abs_employment_osca"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    osca_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsic_code: Mapped[str] = mapped_column(Text, nullable=False)
    area_code: Mapped[str] = mapped_column(Text, nullable=False, server_default="AU0000")
    apportioned_employment: Mapped[float | None] = mapped_column(Float)
    link_method: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float)
    release_year: Mapped[int] = mapped_column(Integer, nullable=False)
    osca_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="2024.1.0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("ix_abs_emp_osca_osca", "osca_code"),
        Index("ix_abs_emp_osca_anzsco", "anzsco_code"),
        Index("ix_abs_emp_osca_method", "link_method"),
    )
