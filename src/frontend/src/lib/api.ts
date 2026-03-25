/** API client for Tier 1 endpoints. All calls go through Vite proxy (/api -> localhost:8000). */

const BASE = "/api/v1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Types ──

export interface DatasetVersion {
  dataset_name: string;
  version_key: string;
  row_count: number;
  ingested_at: string | null;
}

export interface DatasetsResponse {
  datasets: DatasetVersion[];
  total_rows: number;
}

export interface SectorSummary {
  naics_code: string;
  naics_title: string;
  occupation_count: number;
  total_employment: number | null;
  avg_eloundou_beta: number | null;
  avg_ms_applicability: number | null;
  avg_aei_exposure: number | null;
  zone_e0_count: number;
  zone_e1_count: number;
  zone_e2_count: number;
  weighted_eloundou_beta: number | null;
  weighted_ms_applicability: number | null;
  weighted_aei_exposure: number | null;
  workers_e0: number;
  workers_e1: number;
  workers_e2: number;
}

export interface SectorsResponse {
  sectors: SectorSummary[];
  total_sectors: number;
  region: string;
}

export interface OccupationSummary {
  soc_code: string;
  title: string;
  major_group: string;
  major_group_title: string | null;
  headcount: number | null;
  eloundou_beta: number | null;
  ms_ai_applicability: number | null;
  aei_exposure: number | null;
  dominant_zone: string | null;
  drift_velocity: number | null;
  drift_classification: string | null;
}

export interface OccupationEraSnapshot {
  model_era: string;
  avg_task_pct: number;
  task_count: number;
}

export interface OccupationDetail {
  soc_code: string;
  title: string;
  description: string | null;
  major_group: string;
  eloundou_beta_gpt4: number | null;
  eloundou_beta_human: number | null;
  ms_ai_applicability: number | null;
  aei_exposure: number | null;
  dominant_zone: string | null;
  total_employment: number | null;
  top_sectors: { naics_code: string; naics_title: string; headcount: number | null; employment_share: number | null }[];
  drift_velocity: number | null;
  drift_classification: string | null;
  // Percentile context
  eloundou_percentile: number | null;
  ms_ai_percentile: number | null;
  aei_percentile: number | null;
  eloundou_median: number | null;
  ms_ai_median: number | null;
  aei_median: number | null;
  eloundou_population: number | null;
  ms_ai_population: number | null;
  aei_population: number | null;
  aei_era_snapshots: OccupationEraSnapshot[];
  gdpval_task_count: number;
  gdpval_available: boolean;
}

export interface TaskWithDrift {
  task_text: string;
  task_pct: number | null;
  velocity: number | null;
  r_squared: number | null;
  classification: string | null;
  snapshot_count: number | null;
}

export interface OccupationTasksResponse {
  soc_code: string;
  title: string;
  tasks: TaskWithDrift[];
  total_tasks: number;
}

export interface SocHierarchyNode {
  code: string;
  title: string;
  level: string;
  children: SocHierarchyNode[];
  occupation_count: number;
  avg_eloundou_beta: number | null;
  total_employment: number | null;
}

export interface SocHierarchyResponse {
  hierarchy: SocHierarchyNode[];
  total_major_groups: number;
  total_occupations: number;
}

export interface DriftSummary {
  total_tasks: number;
  classified_tasks: number;
  departing: number;
  enduring: number;
  below_threshold: number;
  emerging: number;
  unclassified: number;
  avg_velocity_departing: number | null;
  avg_velocity_enduring: number | null;
}

export interface DriftTask {
  task_text: string;
  velocity: number | null;
  r_squared: number | null;
  latest_task_pct: number | null;
  peak_task_pct: number | null;
  classification: string | null;
  snapshot_count: number | null;
}

export interface DriftListResponse {
  tasks: DriftTask[];
  total: number;
  page: number;
  page_size: number;
}

export interface SearchResult {
  matched_title: string;
  source: string;
  soc_code: string;
  occupation_title: string;
  similarity: number | null;
  eloundou_beta: number | null;
  ms_ai_applicability: number | null;
  aei_exposure: number | null;
  dominant_zone: string | null;
  total_employment: number | null;
  has_tasks: boolean;
  category: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

export interface PriorityRole {
  soc_code: string;
  occupation_title: string;
  headcount: number | null;
  employment_share: number | null;
  location_quotient: number | null;
  eloundou_beta: number | null;
  ms_ai_applicability: number | null;
  aei_exposure: number | null;
  dominant_zone: string | null;
  drift_velocity: number | null;
  drift_classification: string | null;
  impact_score: number | null;
  risk_factors: string[];
}

export interface SectorPrioritiesResponse {
  naics_code: string;
  naics_title: string;
  total_employment: number | null;
  occupation_count: number;
  priority_roles: PriorityRole[];
  full_mix: PriorityRole[];
}

export interface EraSnapshot {
  model_era: string;
  task_pct: number;
  automation_potential: number;
  automation_pct: number | null;
  augmentation_pct: number | null;
}

export interface TaskMatrixPoint {
  task_id: number;
  task_text: string;
  importance: number | null;
  automation_potential: number | null;
  eloundou_dwa_beta: number | null;
  drift_velocity: number | null;
  drift_classification: string | null;
  aei_penetration: number | null;
  quadrant: string | null;
  era_snapshots: EraSnapshot[];
}

export interface TaskMatrixResponse {
  soc_code: string;
  occupation_title: string;
  tasks: TaskMatrixPoint[];
  total_tasks: number;
  quadrant_counts: Record<string, number>;
  available_eras: string[];
  gdpval_benchmark_count: number;
}

// ── GDPval Benchmarks ──

export interface GDPvalRubricItem {
  criterion: string;
  score: number;
  required: boolean;
  tags: string[] | null;
}

export interface GDPvalTaskDetail {
  task_id: string;
  prompt_summary: string;
  rubric_item_count: number;
  max_score: number | null;
  min_score: number | null;
  reference_file_count: number;
  deliverable_file_count: number;
  rubric_items: GDPvalRubricItem[];
}

export interface GDPvalOccupationResponse {
  soc_code: string;
  occupation_title: string;
  sector: string;
  task_count: number;
  tasks: GDPvalTaskDetail[];
}

export interface GDPvalOccupationSummary {
  soc_code: string;
  title: string;
  sector: string;
  task_count: number;
}

export interface GDPvalSummaryResponse {
  total_tasks: number;
  total_occupations: number;
  total_rubric_items: number;
  sectors: string[];
  occupations: GDPvalOccupationSummary[];
}

// ── Composite Sector ──

export interface CompositeOccupation {
  onet_soc: string;
  occupation_title: string;
  total_headcount: number;
  sectors: string[];
  eloundou_beta: number | null;
  ms_ai_applicability: number | null;
  aei_exposure: number | null;
  dominant_zone: string | null;
  drift_velocity: number | null;
  drift_classification: string | null;
}

export interface CompositeSectorResponse {
  codes: string[];
  sector_names: string[];
  total_employment: number;
  occupation_count: number;
  weighted_eloundou_beta: number | null;
  weighted_ms_applicability: number | null;
  weighted_aei_exposure: number | null;
  workers_e0: number;
  workers_e1: number;
  workers_e2: number;
  occupations: CompositeOccupation[];
}

// ── API functions ──

export const api = {
  search: (q: string) => get<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),
  semanticSearch: async (q: string, description?: string) => {
    const res = await fetch(`${BASE}/search/semantic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, description, limit: 20 }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json() as Promise<SearchResponse>;
  },
  datasets: () => get<DatasetsResponse>("/datasets"),
  sectors: (region = "US") => get<SectorsResponse>(`/sectors?region=${region}`),
  sectorOccupations: (code: string, region = "US") => get<OccupationSummary[]>(`/sectors/${code}/occupations?region=${region}`),
  sectorPriorities: (code: string, topN = 10, region = "US") => get<SectorPrioritiesResponse>(`/sectors/${code}/priorities?top_n=${topN}&region=${region}`),
  occupations: (params?: string) => get<{ occupations: OccupationSummary[]; total: number }>(`/occupations${params ? `?${params}` : ""}`),
  hierarchy: () => get<SocHierarchyResponse>("/occupations/hierarchy"),
  occupation: (soc: string) => get<OccupationDetail>(`/occupations/${soc}`),
  occupationTasks: (soc: string) => get<OccupationTasksResponse>(`/occupations/${soc}/tasks`),
  taskMatrix: (soc: string) => get<TaskMatrixResponse>(`/occupations/${soc}/matrix`),
  driftSummary: () => get<DriftSummary>("/drift/summary"),
  driftDeparting: (page = 1, size = 20) => get<DriftListResponse>(`/drift/departing?page=${page}&page_size=${size}`),
  driftBelowThreshold: () => get<DriftListResponse>("/drift/below-threshold"),
  driftEnduring: (page = 1, size = 20) => get<DriftListResponse>(`/drift/enduring?page=${page}&page_size=${size}`),
  gdpvalSummary: () => get<GDPvalSummaryResponse>("/gdpval/summary"),
  gdpvalOccupation: (soc: string) => get<GDPvalOccupationResponse>(`/gdpval/occupations/${soc}`),
  compositeAnalysis: (codes: string[], region = "US") =>
    get<CompositeSectorResponse>(`/sectors/composite?codes=${codes.join(",")}&region=${region}`),
};
