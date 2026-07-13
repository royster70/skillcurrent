"""Anthropic Economic Index (AEI) labor market impact models.

Empirical AI exposure and task penetration scores derived from Claude
conversation analysis via the Clio classification system.

Source: https://huggingface.co/datasets/Anthropic/EconomicIndex (CC-BY)
"""

from sqlalchemy import Float, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AeiJobExposure(Base):
    """Occupation-level observed AI exposure from Claude usage (756 occupations).

    SOC codes are 6-digit (e.g., "11-1011") — join to O*NET via prefix match.
    observed_exposure is the fraction of the occupation's tasks where Claude
    is actively used, derived from conversation analysis.
    """

    __tablename__ = "aei_job_exposure"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    occ_code: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    observed_exposure: Mapped[float | None] = mapped_column(Float)
    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (Index("ix_aei_job_exposure_occ_code", "occ_code"),)


class AeiTaskPenetration(Base):
    """Task-level AI penetration scores (17,998 tasks).

    Joins to onet_task_statements via task text matching. Penetration score
    is the empirical fraction of conversations where Claude addresses this task.
    7.5% of tasks have non-zero penetration — the remaining 92.5% being zero
    is a meaningful signal (adoption gap, not data absence).
    """

    __tablename__ = "aei_task_penetration"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task: Mapped[str] = mapped_column(Text, nullable=False)
    penetration: Mapped[float | None] = mapped_column(Float)
    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (Index("ix_aei_task_penetration_penetration", "penetration"),)
