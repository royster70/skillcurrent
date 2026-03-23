"""Eloundou DWA-level derived exposure scores.

Derived from occupation-level scores via Strategy A: distributing occupation
Beta across DWAs weighted by O*NET task importance ratings.

Each row = one DWA within one occupation, with derived E1/E2/E0/Beta scores
from both GPT-4 and human raters.
"""

from sqlalchemy import Float, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EloundouDwaScore(Base):
    """DWA-level derived exposure scores.

    importance_weight: fraction of occupation's total task importance
    assigned to this DWA (sum of weights per occupation = 1.0).
    task_count: number of tasks linking this DWA to this occupation.
    source: 'derived' (Strategy A) or 'llm_rubric' (Strategy B, future).
    """

    __tablename__ = "eloundou_dwa_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(Text, nullable=False)
    dwa_id: Mapped[str] = mapped_column(Text, nullable=False)
    dwa_title: Mapped[str | None] = mapped_column(Text)

    dv_e1_alpha: Mapped[float | None] = mapped_column(Float)
    dv_e2_beta: Mapped[float | None] = mapped_column(Float)
    dv_e0_gamma: Mapped[float | None] = mapped_column(Float)
    dv_beta_derived: Mapped[float | None] = mapped_column(Float)

    human_e1_alpha: Mapped[float | None] = mapped_column(Float)
    human_e2_beta: Mapped[float | None] = mapped_column(Float)
    human_e0_gamma: Mapped[float | None] = mapped_column(Float)
    human_beta_derived: Mapped[float | None] = mapped_column(Float)

    importance_weight: Mapped[float | None] = mapped_column(Float)
    task_count: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="derived")

    dataset_version: Mapped[str] = mapped_column(Text, nullable=False)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")

    __table_args__ = (
        Index("ix_eloundou_dwa_scores_onet_soc", "onet_soc"),
        Index("ix_eloundou_dwa_scores_dwa_id", "dwa_id"),
        Index("ix_eloundou_dwa_scores_dv_beta", "dv_beta_derived"),
    )
