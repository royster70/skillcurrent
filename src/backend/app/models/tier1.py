from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
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
    profile_date: Mapped[date] = mapped_column(Date, nullable=False)
    release_year: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("naics_code", "onet_soc", "release_year"),
        Index("ix_industry_occupation_profiles_naics_code", "naics_code"),
        Index("ix_industry_occupation_profiles_onet_soc", "onet_soc"),
        Index("ix_industry_occupation_profiles_dominant_zone", "dominant_zone"),
    )
