"""Eloundou et al. (2024) "GPTs are GPTs" occupation-level exposure scores.

Provides E1 (alpha), E2 (beta), E0 (gamma) scores per O*NET occupation
from both GPT-4 and human annotators. Derived Beta = E1 + 0.5*E2.

Column mapping from source CSV:
  alpha → E1 (direct LLM exposure)
  beta  → E2 (complementary/tools exposure)
  gamma → E0 (overall exposure)

Source: OpenAI supplementary data (occ_level.csv)
Paper: Eloundou, Manning, Mishkin, Rock (2024). Science 384:1306-1308.
"""

from datetime import datetime

from sqlalchemy import Float, ForeignKey, Index, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EloundouOccScore(Base):
    """Occupation-level AI exposure scores from Eloundou et al. (2024).

    923 occupations scored by both GPT-4 (dv_) and human annotators.
    8-digit O*NET SOC codes — direct FK to onet_occupations.

    Invariant: E0 >= max(E1, E2) — holds for both rater types (verified).
    Derived Beta = E1 + 0.5*E2 — computed on ingest, can exceed 1.0.
    """

    __tablename__ = "eloundou_occ_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(
        Text, ForeignKey("onet_occupations.onet_soc"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(Text)

    # GPT-4 rater scores (dv_ prefix in source CSV)
    dv_e1_alpha: Mapped[float | None] = mapped_column(Float)
    dv_e2_beta: Mapped[float | None] = mapped_column(Float)
    dv_e0_gamma: Mapped[float | None] = mapped_column(Float)
    dv_beta_derived: Mapped[float | None] = mapped_column(Float)  # E1 + 0.5*E2

    # Human annotator scores
    human_e1_alpha: Mapped[float | None] = mapped_column(Float)
    human_e2_beta: Mapped[float | None] = mapped_column(Float)
    human_e0_gamma: Mapped[float | None] = mapped_column(Float)
    human_beta_derived: Mapped[float | None] = mapped_column(Float)  # E1 + 0.5*E2

    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_eloundou_occ_scores_onet_soc", "onet_soc"),
        Index("ix_eloundou_occ_scores_dv_beta", "dv_beta_derived"),
    )
