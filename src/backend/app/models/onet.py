"""O*NET 28.1 detail models: tasks, DWAs, sample titles, alternate titles, emerging tasks.

The OnetOccupation model (SOC codes + titles) is in tier1.py (migration 001).
These models cover the detailed content tables loaded from the 9 O*NET files.
"""

from sqlalchemy import Float, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OnetTaskStatement(Base):
    """O*NET task statements — ~18,800 occupation-specific task descriptions.

    Joins to AEI via task_text. Joins to DWAs via onet_tasks_to_dwas.
    """

    __tablename__ = "onet_task_statements"

    onet_soc: Mapped[str] = mapped_column(
        Text, ForeignKey("onet_occupations.onet_soc"), primary_key=True
    )
    task_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task: Mapped[str] = mapped_column(Text, nullable=False)
    task_type: Mapped[str | None] = mapped_column(Text)
    incumbents_responding: Mapped[int | None] = mapped_column(Integer)
    date: Mapped[str | None] = mapped_column(Text)
    domain_source: Mapped[str | None] = mapped_column(Text)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_onet_task_statements_onet_soc", "onet_soc"),
        Index("ix_onet_task_statements_task_id", "task_id"),
    )


class OnetTaskRating(Base):
    """O*NET task ratings — importance/relevance scores per task.

    Scale IDs: FT = Frequency, IM = Importance, RT = Relevance.
    Used for FR-8.3 task classification: high importance + low AEI usage = enduring.
    """

    __tablename__ = "onet_task_ratings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(
        Text, ForeignKey("onet_occupations.onet_soc"), nullable=False
    )
    task_id: Mapped[int] = mapped_column(Integer, nullable=False)
    scale_id: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    data_value: Mapped[float | None] = mapped_column(Float)
    n: Mapped[int | None] = mapped_column(Integer)
    standard_error: Mapped[float | None] = mapped_column(Float)
    lower_ci_bound: Mapped[float | None] = mapped_column(Float)
    upper_ci_bound: Mapped[float | None] = mapped_column(Float)
    recommend_suppress: Mapped[str | None] = mapped_column(Text)
    date: Mapped[str | None] = mapped_column(Text)
    domain_source: Mapped[str | None] = mapped_column(Text)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_onet_task_ratings_onet_soc", "onet_soc"),
        Index("ix_onet_task_ratings_task_id", "task_id"),
        Index("ix_onet_task_ratings_scale_id", "scale_id"),
    )


class OnetDwaReference(Base):
    """O*NET DWA reference — ~2,087 Detailed Work Activity definitions.

    DWA codes (e.g., "4.A.1.a.1.I01.D01") are the join key to Eloundou scores.
    """

    __tablename__ = "onet_dwa_references"

    dwa_id: Mapped[str] = mapped_column(Text, primary_key=True)
    element_id: Mapped[str] = mapped_column(Text, nullable=False)
    iwa_id: Mapped[str] = mapped_column(Text, nullable=False)
    dwa_title: Mapped[str] = mapped_column(Text, nullable=False)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (Index("ix_onet_dwa_references_element_id", "element_id"),)


class OnetTaskToDwa(Base):
    """O*NET task-to-DWA mapping — links task statements to DWA codes.

    This is the direct join path: task statement -> DWA -> Eloundou E0/E1/E2.
    Avoids the lossy indirect path via SOC code.
    """

    __tablename__ = "onet_tasks_to_dwas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(
        Text, ForeignKey("onet_occupations.onet_soc"), nullable=False
    )
    task_id: Mapped[int] = mapped_column(Integer, nullable=False)
    dwa_id: Mapped[str] = mapped_column(Text, nullable=False)
    date: Mapped[str | None] = mapped_column(Text)
    domain_source: Mapped[str | None] = mapped_column(Text)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_onet_tasks_to_dwas_onet_soc", "onet_soc"),
        Index("ix_onet_tasks_to_dwas_task_id", "task_id"),
        Index("ix_onet_tasks_to_dwas_dwa_id", "dwa_id"),
    )


class OnetWorkActivity(Base):
    """O*NET work activities — ~73k DWA importance/level ratings per occupation.

    Element ID format: "4.A.X.x.x" (e.g., "4.A.1.a.1").
    Scale IDs: IM = Importance, LV = Level.
    """

    __tablename__ = "onet_work_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(
        Text, ForeignKey("onet_occupations.onet_soc"), nullable=False
    )
    element_id: Mapped[str] = mapped_column(Text, nullable=False)
    element_name: Mapped[str] = mapped_column(Text, nullable=False)
    scale_id: Mapped[str] = mapped_column(Text, nullable=False)
    data_value: Mapped[float | None] = mapped_column(Float)
    n: Mapped[int | None] = mapped_column(Integer)
    standard_error: Mapped[float | None] = mapped_column(Float)
    lower_ci_bound: Mapped[float | None] = mapped_column(Float)
    upper_ci_bound: Mapped[float | None] = mapped_column(Float)
    recommend_suppress: Mapped[str | None] = mapped_column(Text)
    not_relevant: Mapped[str | None] = mapped_column(Text)
    date: Mapped[str | None] = mapped_column(Text)
    domain_source: Mapped[str | None] = mapped_column(Text)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_onet_work_activities_onet_soc", "onet_soc"),
        Index("ix_onet_work_activities_element_id", "element_id"),
        Index("ix_onet_work_activities_scale_id", "scale_id"),
    )


class OnetSampleTitle(Base):
    """O*NET sample of reported titles — ~7,953 job titles for Layer 1 matching."""

    __tablename__ = "onet_sample_titles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(
        Text, ForeignKey("onet_occupations.onet_soc"), nullable=False
    )
    reported_job_title: Mapped[str] = mapped_column(Text, nullable=False)
    shown_in_my_next_move: Mapped[str | None] = mapped_column(Text)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_onet_sample_titles_onet_soc", "onet_soc"),
        Index("ix_onet_sample_titles_title", "reported_job_title"),
    )


class OnetAlternateTitle(Base):
    """O*NET alternate titles — ~57,543 additional titles for Layer 1 matching."""

    __tablename__ = "onet_alternate_titles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(
        Text, ForeignKey("onet_occupations.onet_soc"), nullable=False
    )
    alternate_title: Mapped[str] = mapped_column(Text, nullable=False)
    short_title: Mapped[str | None] = mapped_column(Text)
    sources: Mapped[str | None] = mapped_column(Text)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_onet_alternate_titles_onet_soc", "onet_soc"),
        Index("ix_onet_alternate_titles_title", "alternate_title"),
    )


class OnetEmergingTask(Base):
    """O*NET emerging tasks — 328 new tasks identified in occupations.

    Category: 'New' or 'Updated'. Maps to FR-8.3 'emerging' classification.
    """

    __tablename__ = "onet_emerging_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(
        Text, ForeignKey("onet_occupations.onet_soc"), nullable=False
    )
    task: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    original_task_id: Mapped[str | None] = mapped_column(Text)
    original_task: Mapped[str | None] = mapped_column(Text)
    date: Mapped[str | None] = mapped_column(Text)
    domain_source: Mapped[str | None] = mapped_column(Text)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_onet_emerging_tasks_onet_soc", "onet_soc"),
        Index("ix_onet_emerging_tasks_category", "category"),
    )
