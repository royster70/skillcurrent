from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OnetOccupation(Base):
    __tablename__ = "onet_occupations"

    onet_soc: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    onet_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="28.1")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_onet_occupations_title", "title"),)


class IndustryCrosswalk(Base):
    __tablename__ = "industry_crosswalk"

    source_system: Mapped[str] = mapped_column(Text, primary_key=True)
    source_code: Mapped[str] = mapped_column(Text, primary_key=True)
    target_system: Mapped[str] = mapped_column(Text, primary_key=True)
    target_code: Mapped[str] = mapped_column(Text, primary_key=True)
    bridge_system: Mapped[str | None] = mapped_column(Text)
    bridge_code: Mapped[str | None] = mapped_column(Text)
    match_type: Mapped[str] = mapped_column(Text, nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, server_default="1.0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("ix_industry_crosswalk_source", "source_system", "source_code"),
        Index("ix_industry_crosswalk_target", "target_system", "target_code"),
    )


class AEITaskSnapshot(Base):
    __tablename__ = "aei_task_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_text: Mapped[str] = mapped_column(Text, nullable=False)
    onet_soc_codes: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    release_version: Mapped[str] = mapped_column(Text, nullable=False)
    model_era: Mapped[str] = mapped_column(Text, nullable=False)
    automation_pct: Mapped[float | None] = mapped_column(Float)
    augmentation_pct: Mapped[float | None] = mapped_column(Float)
    task_pct: Mapped[float | None] = mapped_column(Float)
    platform: Mapped[str] = mapped_column(Text, nullable=False, server_default="global")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("task_text", "snapshot_date", "platform"),
        Index("ix_aei_task_snapshots_snapshot_date", "snapshot_date"),
        Index("ix_aei_task_snapshots_release_version", "release_version"),
        Index("ix_aei_task_snapshots_model_era", "model_era"),
        Index("ix_aei_task_snapshots_platform", "platform"),
        Index("ix_aei_task_snapshots_onet_soc_codes", "onet_soc_codes", postgresql_using="gin"),
    )


class OEWSEmployment(Base):
    __tablename__ = "oews_employment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    onet_soc: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    naics_code: Mapped[str] = mapped_column(Text, nullable=False)
    naics_title: Mapped[str | None] = mapped_column(Text)
    area_code: Mapped[str] = mapped_column(Text, nullable=False, server_default="US0000")
    employment: Mapped[int | None] = mapped_column(Integer)
    employment_per_1000: Mapped[float | None] = mapped_column(Float)
    mean_annual_wage: Mapped[int | None] = mapped_column(Integer)
    median_annual_wage: Mapped[int | None] = mapped_column(Integer)
    release_year: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("onet_soc", "naics_code", "area_code", "release_year"),
        Index("ix_oews_employment_onet_soc", "onet_soc"),
        Index("ix_oews_employment_naics_code", "naics_code"),
        Index("ix_oews_employment_release_year", "release_year"),
    )


class IndustryOccupationProfile(Base):
    __tablename__ = "industry_occupation_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    naics_code: Mapped[str] = mapped_column(Text, nullable=False)
    naics_title: Mapped[str | None] = mapped_column(Text)
    onet_soc: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    occupation_title: Mapped[str | None] = mapped_column(Text)
    employment_share: Mapped[float | None] = mapped_column(Float)
    headcount: Mapped[int | None] = mapped_column(Integer)
    avg_automation_pct: Mapped[float | None] = mapped_column(Float)
    avg_augmentation_pct: Mapped[float | None] = mapped_column(Float)
    dominant_zone: Mapped[str | None] = mapped_column(Text)
    eloundou_beta: Mapped[float | None] = mapped_column(Float)
    ms_ai_applicability: Mapped[float | None] = mapped_column(Float)
    aei_exposure: Mapped[float | None] = mapped_column(Float)
    drift_velocity: Mapped[float | None] = mapped_column(Float)
    drift_classification: Mapped[str | None] = mapped_column(Text)
    profile_date: Mapped[date] = mapped_column(Date, nullable=False)
    release_year: Mapped[int] = mapped_column(Integer, nullable=False)
    region: Mapped[str] = mapped_column(Text, nullable=False, server_default="US")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("naics_code", "onet_soc", "release_year", "region", name="uq_iop_naics_soc_year_region"),
        Index("ix_industry_occupation_profiles_naics_code", "naics_code"),
        Index("ix_industry_occupation_profiles_onet_soc", "onet_soc"),
        Index("ix_industry_occupation_profiles_dominant_zone", "dominant_zone"),
        Index("ix_industry_occupation_profiles_region", "region"),
    )


class ABSEmployment(Base):
    """Australian Bureau of Statistics employment data by ANZSCO × ANZSIC."""

    __tablename__ = "abs_employment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    anzsco_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_title: Mapped[str | None] = mapped_column(Text)
    anzsic_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsic_title: Mapped[str | None] = mapped_column(Text)
    area_code: Mapped[str] = mapped_column(Text, nullable=False, server_default="AU0000")
    employment: Mapped[int | None] = mapped_column(Integer)
    employment_per_1000: Mapped[float | None] = mapped_column(Float)
    median_annual_wage: Mapped[int | None] = mapped_column(Integer)
    release_year: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("anzsco_code", "anzsic_code", "area_code", "release_year"),
        Index("ix_abs_employment_anzsco", "anzsco_code"),
        Index("ix_abs_employment_anzsic", "anzsic_code"),
        Index("ix_abs_employment_release_year", "release_year"),
    )


class ANZSCOSOCConcordance(Base):
    """ANZSCO → O*NET SOC occupation mapping via semantic matching."""

    __tablename__ = "anzsco_soc_concordance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    anzsco_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_title: Mapped[str] = mapped_column(Text, nullable=False)
    onet_soc: Mapped[str] = mapped_column(Text, nullable=False)
    onet_title: Mapped[str | None] = mapped_column(Text)
    match_method: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    matched_variant: Mapped[str | None] = mapped_column(Text)  # which title variant produced the match
    reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("anzsco_code", "onet_soc"),
        Index("ix_anzsco_soc_anzsco", "anzsco_code"),
        Index("ix_anzsco_soc_onet", "onet_soc"),
        Index("ix_anzsco_soc_confidence", "confidence"),
    )


class ABSCensusWPP(Base):
    """ABS 2021 Census WPP W12A — Industry × Occupation (ANZSIC division × ANZSCO major group)."""

    __tablename__ = "abs_census_wpp"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    geography_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsic_division_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsic_division_abbrev: Mapped[str] = mapped_column(Text, nullable=False)
    anzsic_division_name: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_major_group: Mapped[int | None] = mapped_column(Integer)
    anzsco_major_group_abbrev: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_major_group_name: Mapped[str] = mapped_column(Text, nullable=False)
    employed_count: Mapped[int | None] = mapped_column(Integer)
    census_year: Mapped[int] = mapped_column(Integer, nullable=False, server_default="2021")
    source_table: Mapped[str] = mapped_column(Text, nullable=False, server_default="W12A")
    integrity_hash: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "geography_code", "anzsic_division_abbrev",
            "anzsco_major_group_abbrev", "census_year",
            name="uq_abs_census_wpp_cell",
        ),
        Index("ix_abs_census_wpp_anzsic", "anzsic_division_code"),
        Index("ix_abs_census_wpp_anzsco", "anzsco_major_group"),
        Index("ix_abs_census_wpp_geo_year", "geography_code", "census_year"),
    )


class ABSCensusW13(Base):
    """ABS 2021 Census WPP W13 — Occupation (ANZSCO sub-major group) × Sex."""

    __tablename__ = "abs_census_w13"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    geography_code: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_major_group: Mapped[int | None] = mapped_column(Integer)
    anzsco_major_group_name: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_submajor_code: Mapped[str | None] = mapped_column(Text)
    anzsco_submajor_abbrev: Mapped[str] = mapped_column(Text, nullable=False)
    anzsco_submajor_name: Mapped[str] = mapped_column(Text, nullable=False)
    sex: Mapped[str] = mapped_column(Text, nullable=False)
    employed_count: Mapped[int | None] = mapped_column(Integer)
    census_year: Mapped[int] = mapped_column(Integer, nullable=False, server_default="2021")
    source_table: Mapped[str] = mapped_column(Text, nullable=False, server_default="W13")
    integrity_hash: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "geography_code", "anzsco_submajor_abbrev", "sex", "census_year",
            name="uq_abs_census_w13_cell",
        ),
        Index("ix_abs_census_w13_major", "anzsco_major_group"),
        Index("ix_abs_census_w13_submajor", "anzsco_submajor_code"),
        Index("ix_abs_census_w13_sex", "sex"),
        Index("ix_abs_census_w13_geo_year", "geography_code", "census_year"),
    )
