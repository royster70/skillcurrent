"""Pydantic response models for Tier 1 API endpoints."""

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


class OccupationMixEntry(BaseModel):
    """One row of Census occupation mix — ANZSCO major group within an ANZSIC division."""

    anzsco_major_group: int | None = None
    major_group_name: str
    employed_count: int
    share_pct: float  # 0-100, rounded to 1dp


class SubdivisionEntry(BaseModel):
    """One ANZSIC subdivision within a division — from JSA Industry Data Table 3."""

    subdivision_name: str
    employment: int | None = None
    share_pct: float  # 0-100, rounded to 1dp


class SubdivisionOccupationRow(BaseModel):
    """One ANZSCO major group count within an ANZSIC subdivision — from Census 2021."""

    anzsco_major_group: int
    major_group_name: str
    employed_count: int
    share_pct: float  # 0-100, share within this subdivision


class SubdivisionOccupationProfile(BaseModel):
    """Occupation breakdown for a single ANZSIC subdivision — Census 2021 cross-tab."""

    indp_name: str  # Census subdivision label (e.g. "Electricity Supply")
    anzsic_division_code: str
    total_employed: int
    occupations: list[SubdivisionOccupationRow]


class SectorOccupationMix(BaseModel):
    """Census 2021 occupation mix for an AU sector (ANZSIC division)."""

    anzsic_division_code: str
    anzsic_division_name: str
    census_year: int = 2021
    total_employed: int
    mix: list[OccupationMixEntry]


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
    # Employment-weighted scores (headcount-weighted averages)
    weighted_eloundou_beta: float | None = None
    weighted_ms_applicability: float | None = None
    weighted_aei_exposure: float | None = None
    # Workers per zone (headcount, not occupation count)
    workers_e0: int = 0
    workers_e1: int = 0
    workers_e2: int = 0
    # Census occupation mix (AU only, None for US)
    occupation_mix: list[OccupationMixEntry] | None = None
    # ANZSIC subdivisions (AU only, None for US)
    subdivisions: list[SubdivisionEntry] | None = None


class SectorsResponse(BaseModel):
    sectors: list[SectorSummary]
    total_sectors: int
    region: str = "US"


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


class OccupationEraSnapshot(BaseModel):
    model_era: str
    avg_task_pct: float
    task_count: int


class SignalCoverage(BaseModel):
    """Which independent signals actually cover this occupation (GitHub #73).

    Presence flags only — the qualitative `confidence` word is derived by
    COUNTING non-null core signals, never by blending confidence values
    across sources (CLAUDE.md invariant). GDPval is reported but not
    counted: it is a benchmark corpus, not an exposure signal.
    """

    eloundou: bool
    microsoft: bool
    aei: bool
    gdpval: bool
    signal_count: int  # 0–3 core scalar signals present
    confidence: str  # "high" (3) | "moderate" (2) | "limited" (<=1)


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
    # Percentile context (for data storytelling)
    eloundou_percentile: int | None = None
    ms_ai_percentile: int | None = None
    aei_percentile: int | None = None
    eloundou_median: float | None = None
    ms_ai_median: float | None = None
    aei_median: float | None = None
    eloundou_population: int | None = None
    ms_ai_population: int | None = None
    aei_population: int | None = None
    # AEI temporal trend (occupation-level aggregation across model eras)
    aei_era_snapshots: list[OccupationEraSnapshot] = []
    # GDPval benchmark availability
    gdpval_task_count: int = 0
    gdpval_available: bool = False
    # Evidence coverage (#73). Optional so pre-regen static payloads (which
    # lack the field) still validate client-side; the frontend renders no
    # badge when absent.
    signal_coverage: SignalCoverage | None = None


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
    # SOC major-group names this task rolls up to (AEI task → onet_soc_codes →
    # major group). Many-to-many + imperfect text match; None when the task has
    # no SOC linkage (reads as "unassigned" on the Rising Tide family grouping).
    families: list[str] | None = None


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


# ── Bearings (high ground + direction) ──


class HighGroundSkill(BaseModel):
    dwa_id: str
    dwa_title: str
    beta: float
    importance_weight: float | None = None


class AdjacentRole(BaseModel):
    soc_code: str
    title: str
    beta: float
    drier_by: float  # source β − target β (always > 0 by construction)
    shared_count: int
    shared_titles: list[str]  # the bridge skills — top shared dry DWAs
    total_employment: float | None = None
    score: float  # shared_importance × drier_by — transparent, not blended


class BearingsResponse(BaseModel):
    soc_code: str
    title: str
    source_beta: float | None = None
    high_ground: list[HighGroundSkill]
    adjacent: list[AdjacentRole]


# ── GDPval Benchmarks ──


class GDPvalRubricItem(BaseModel):
    criterion: str
    score: int
    required: bool = False
    tags: list[str] | None = None


class GDPvalTaskDetail(BaseModel):
    task_id: str
    prompt_summary: str
    rubric_item_count: int
    max_score: int | None = None
    min_score: int | None = None
    reference_file_count: int = 0
    deliverable_file_count: int = 0
    rubric_items: list[GDPvalRubricItem] = []


class GDPvalOccupationResponse(BaseModel):
    soc_code: str
    occupation_title: str
    sector: str
    task_count: int
    tasks: list[GDPvalTaskDetail]


class GDPvalOccupationSummary(BaseModel):
    soc_code: str
    title: str
    sector: str
    task_count: int


class GDPvalSummaryResponse(BaseModel):
    total_tasks: int
    total_occupations: int
    total_rubric_items: int
    sectors: list[str]
    occupations: list[GDPvalOccupationSummary]
