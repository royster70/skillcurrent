"""Pydantic response models for Tier 1 API endpoints."""

from datetime import date

from pydantic import BaseModel


# ── Dataset Versions ──


class DatasetVersionResponse(BaseModel):
    dataset_name: str
    version_key: str
    row_count: int
    ingested_at: str | None = None
    source_url: str | None = None


class DatasetVersionsResponse(BaseModel):
    datasets: list[DatasetVersionResponse]
    total_rows: int


# ── Sectors ──


class SectorSummary(BaseModel):
    naics_code: str
    naics_title: str
    occupation_count: int
    total_employment: int | None = None
    avg_eloundou_beta: float | None = None
    avg_ms_applicability: float | None = None
    avg_aei_exposure: float | None = None
    zone_e0_count: int = 0
    zone_e1_count: int = 0
    zone_e2_count: int = 0


class SectorsResponse(BaseModel):
    sectors: list[SectorSummary]
    total_sectors: int


# ── Occupations ──


class OccupationSummary(BaseModel):
    soc_code: str
    title: str
    major_group: str
    major_group_title: str | None = None
    headcount: int | None = None
    eloundou_beta: float | None = None
    ms_ai_applicability: float | None = None
    aei_exposure: float | None = None
    dominant_zone: str | None = None
    drift_velocity: float | None = None
    drift_classification: str | None = None


class OccupationDetail(BaseModel):
    soc_code: str
    title: str
    description: str | None = None
    major_group: str
    minor_group: str | None = None
    # Three-tier scores
    eloundou_beta_gpt4: float | None = None
    eloundou_beta_human: float | None = None
    ms_ai_applicability: float | None = None
    aei_exposure: float | None = None
    # Zone
    dominant_zone: str | None = None
    # Employment
    total_employment: int | None = None
    top_sectors: list["OccupationSectorProfile"] | None = None
    # Drift
    drift_velocity: float | None = None
    drift_classification: str | None = None


class OccupationSectorProfile(BaseModel):
    naics_code: str
    naics_title: str
    headcount: int | None = None
    employment_share: float | None = None


class OccupationsResponse(BaseModel):
    occupations: list[OccupationSummary]
    total: int
    page: int
    page_size: int


# ── SOC Hierarchy ──


class SocHierarchyNode(BaseModel):
    code: str
    title: str
    level: str  # 'major', 'minor', 'broad', 'detailed'
    children: list["SocHierarchyNode"] = []
    occupation_count: int = 0
    avg_eloundou_beta: float | None = None
    total_employment: int | None = None


class SocHierarchyResponse(BaseModel):
    hierarchy: list[SocHierarchyNode]
    total_major_groups: int
    total_occupations: int


# ── Tasks ──


class TaskWithDrift(BaseModel):
    task_text: str
    task_pct: float | None = None
    velocity: float | None = None
    r_squared: float | None = None
    classification: str | None = None
    snapshot_count: int | None = None


class OccupationTasksResponse(BaseModel):
    soc_code: str
    title: str
    tasks: list[TaskWithDrift]
    total_tasks: int


# ── Drift ──


class DriftTaskSummary(BaseModel):
    task_text: str
    velocity: float | None = None
    r_squared: float | None = None
    latest_task_pct: float | None = None
    peak_task_pct: float | None = None
    classification: str | None = None
    snapshot_count: int | None = None


class DriftSummaryResponse(BaseModel):
    total_tasks: int
    classified_tasks: int
    departing: int
    enduring: int
    below_threshold: int
    emerging: int
    unclassified: int
    avg_velocity_departing: float | None = None
    avg_velocity_enduring: float | None = None


class DriftListResponse(BaseModel):
    tasks: list[DriftTaskSummary]
    total: int
    page: int
    page_size: int
