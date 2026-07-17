"""Jobs and Skills Australia — "Our Gen AI Transition" (Aug 2025).

The platform's FIRST published AU-native AI-exposure signal. Until now all
Australian task-level exposure came through the semantic DWA→ASC bridge (i.e.
US Eloundou β imported by cosine similarity, ADR-011); this is an independent
Australian-government reading, keyed by 4-digit ANZSCO unit group.

Kept as its OWN signal, never blended with the bridge-derived `au_task_beta`
(CLAUDE.md: US-imported and AU-native exposure stay in separate columns). Its
augmentation/automation are each on their own 0–1 scale — NOT the platform's β
(E1 + 0.5·E2) — so they are surfaced as JSA's own reading, never mapped to a
β/zone.
"""

from datetime import datetime

from sqlalchemy import Float, Index, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class JsaGenaiExposure(Base):
    """One row per 4-digit ANZSCO unit group — JSA's Gen AI augmentation +
    automation exposure and its supplementary transition metrics."""

    __tablename__ = "jsa_genai_exposure"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    anzsco_code: Mapped[str] = mapped_column(Text, nullable=False)  # 4-digit unit group
    anzsco_title: Mapped[str | None] = mapped_column(Text)
    matrix_group: Mapped[str | None] = mapped_column(Text)
    # The core signal — each 0–1, independent (NOT the platform's β).
    augmentation_score: Mapped[float | None] = mapped_column(Float)
    automation_score: Mapped[float | None] = mapped_column(Float)
    # Supplementary transition metrics (some are scaled/differential and can be
    # negative — no range constraint).
    rate_of_skill_change: Mapped[float | None] = mapped_column(Float)
    historical_mobility: Mapped[float | None] = mapped_column(Float)
    high_fit_transition_rate: Mapped[float | None] = mapped_column(Float)
    hybridisation_potential: Mapped[float | None] = mapped_column(Float)
    specialisation_potential: Mapped[float | None] = mapped_column(Float)
    entry_level_ad_share: Mapped[float | None] = mapped_column(Float)
    jsa_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="2025.08")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("anzsco_code", "jsa_version", name="uq_jsa_genai_anzsco_version"),
        Index("ix_jsa_genai_exposure_anzsco_code", "anzsco_code"),
    )
