"""Microsoft "Working with AI" dataset models (Tomlinson et al., 2025).

Empirical AI applicability scores derived from Bing Copilot usage data
(Jan–Sept 2024). Measures how AI is actually being used for work activities,
complementing the theoretical exposure scores from Eloundou.

Source: https://github.com/microsoft/working-with-ai (CC-BY 4.0)
Paper: "Working with AI: Measuring the Applicability of Generative AI to Occupations"
"""

from sqlalchemy import Boolean, Float, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MsAiApplicabilityScore(Base):
    """AI applicability score per SOC occupation (785 occupations).

    Single composite score averaging user-goal and AI-action perspectives.
    SOC codes are 6-digit (e.g., "11-1011") — join to O*NET via prefix match.
    """

    __tablename__ = "ms_ai_applicability_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    ai_applicability_score: Mapped[float | None] = mapped_column(Float)
    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (Index("ix_ms_ai_applicability_soc", "soc_code"),)


class MsAiSocMetric(Base):
    """Detailed SOC-level metrics from Copilot usage (785 occupations).

    Paired user/AI metrics across coverage, completion, feedback, impact scope,
    and applicability scoring.
    """

    __tablename__ = "ms_ai_soc_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    coverage_user: Mapped[float | None] = mapped_column(Float)
    coverage_ai: Mapped[float | None] = mapped_column(Float)
    completion_user: Mapped[float | None] = mapped_column(Float)
    completion_ai: Mapped[float | None] = mapped_column(Float)
    feedback_positive_fraction_user: Mapped[float | None] = mapped_column(Float)
    feedback_positive_fraction_ai: Mapped[float | None] = mapped_column(Float)
    impact_scope_user: Mapped[float | None] = mapped_column(Float)
    impact_scope_ai: Mapped[float | None] = mapped_column(Float)
    ai_applicability_score_user: Mapped[float | None] = mapped_column(Float)
    ai_applicability_score_ai_nonphysical: Mapped[float | None] = mapped_column(Float)
    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (Index("ix_ms_ai_soc_metrics_soc", "soc_code"),)


class MsAiIwaMetric(Base):
    """IWA-level metrics from Copilot usage (332 Intermediate Work Activities).

    IWA codes (e.g., "4.A.1.a.1.I01") map to O*NET's work activity hierarchy.
    These sit between GWAs and DWAs — joinable to our onet_dwa_references via element_id.
    """

    __tablename__ = "ms_ai_iwa_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    iwa_code: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    share_user: Mapped[float | None] = mapped_column(Float)
    share_ai: Mapped[float | None] = mapped_column(Float)
    completion_user: Mapped[float | None] = mapped_column(Float)
    completion_ai: Mapped[float | None] = mapped_column(Float)
    impact_scope_user: Mapped[float | None] = mapped_column(Float)
    impact_scope_ai: Mapped[float | None] = mapped_column(Float)
    feedback_positive_fraction_user: Mapped[float | None] = mapped_column(Float)
    feedback_positive_fraction_ai: Mapped[float | None] = mapped_column(Float)
    completion_x_scope_x_coverage_user: Mapped[float | None] = mapped_column(Float)
    completion_x_scope_x_coverage_ai: Mapped[float | None] = mapped_column(Float)
    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (Index("ix_ms_ai_iwa_metrics_iwa", "iwa_code"),)


class MsAiSocToIwa(Base):
    """SOC-to-IWA mapping (13,698 mappings).

    Maps which IWAs are relevant to each occupation. Used to join
    IWA-level metrics to occupations.
    """

    __tablename__ = "ms_ai_soc_to_iwas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(Text, nullable=False)
    iwa_code: Mapped[str] = mapped_column(Text, nullable=False)
    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        Index("ix_ms_ai_soc_to_iwas_soc", "soc_code"),
        Index("ix_ms_ai_soc_to_iwas_iwa", "iwa_code"),
    )


class MsAiPhysicalTask(Base):
    """Physical task classification (18,796 tasks).

    Boolean flag per O*NET task ID indicating whether the task is physical.
    Physical tasks are excluded from AI-action applicability scoring.
    """

    __tablename__ = "ms_ai_physical_tasks"

    task_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    physical: Mapped[bool] = mapped_column(Boolean, nullable=False)
    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)
