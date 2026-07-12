"""Australian Skills Classification (ASC v3.0) models (FR-9.2, ADR-011).

The AU-native task/skill layer. Specialist tasks are the exposure carrier for
the DWA pivot — DWA-level exposure attaches via the semantic bridge
(`dwa_asc_bridge`, built in a later step) because the published ASC files carry
no source-DWA column (Phase B0 finding). All three layers key on 4-digit ANZSCO.
"""

from datetime import datetime

from sqlalchemy import Float, Index, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AscSpecialistTask(Base):
    """ASC specialist task — the exposure-bearing AU task layer.

    ``source_dwa_id`` is reserved for the ADR-011 L1 ``dwa_lookup`` rung; it
    stays NULL for ASC v3.0 (no lineage published). ``percent_of_time_spent_*``
    are source-provided weights used to roll exposure up to occupation level.
    """

    __tablename__ = "asc_specialist_task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    anzsco_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_name: Mapped[str | None] = mapped_column(Text)
    specialist_task: Mapped[str] = mapped_column(Text, nullable=False)
    percent_of_time_spent_on_task: Mapped[float | None] = mapped_column(Float)
    specialist_cluster: Mapped[str | None] = mapped_column(Text)
    percent_of_time_spent_on_cluster: Mapped[float | None] = mapped_column(Float)
    cluster_family: Mapped[str | None] = mapped_column(Text)
    percent_of_time_spent_on_family: Mapped[float | None] = mapped_column(Float)
    source_dwa_id: Mapped[str | None] = mapped_column(Text)
    asc_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="3.0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("ix_asc_specialist_task_anzsco", "anzsco_code"),
        Index("ix_asc_specialist_task_dwa", "source_dwa_id"),
    )


class AscCoreCompetency(Base):
    """ASC core competency (10 competencies, scored with proficiency + anchor)."""

    __tablename__ = "asc_core_competency"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    anzsco_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_name: Mapped[str | None] = mapped_column(Text)
    core_competency: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float | None] = mapped_column(Float)
    proficiency_level: Mapped[str | None] = mapped_column(Text)
    anchor_value: Mapped[str | None] = mapped_column(Text)
    asc_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="3.0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (Index("ix_asc_core_competency_anzsco", "anzsco_code"),)


class AscTechnologyTool(Base):
    """ASC technology tool used within an occupation."""

    __tablename__ = "asc_technology_tool"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    anzsco_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_name: Mapped[str | None] = mapped_column(Text)
    technology_tool: Mapped[str] = mapped_column(Text, nullable=False)
    asc_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="3.0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (Index("ix_asc_technology_tool_anzsco", "anzsco_code"),)
