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
}

export interface SectorsResponse {
  sectors: SectorSummary[];
  total_sectors: number;
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
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

// ── API functions ──

export const api = {
  search: (q: string) => get<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),
  datasets: () => get<DatasetsResponse>("/datasets"),
  sectors: () => get<SectorsResponse>("/sectors"),
  sectorOccupations: (code: string) => get<OccupationSummary[]>(`/sectors/${code}/occupations`),
  occupations: (params?: string) => get<{ occupations: OccupationSummary[]; total: number }>(`/occupations${params ? `?${params}` : ""}`),
  hierarchy: () => get<SocHierarchyResponse>("/occupations/hierarchy"),
  occupation: (soc: string) => get<OccupationDetail>(`/occupations/${soc}`),
  occupationTasks: (soc: string) => get<OccupationTasksResponse>(`/occupations/${soc}/tasks`),
  driftSummary: () => get<DriftSummary>("/drift/summary"),
  driftDeparting: (page = 1, size = 20) => get<DriftListResponse>(`/drift/departing?page=${page}&page_size=${size}`),
  driftBelowThreshold: () => get<DriftListResponse>("/drift/below-threshold"),
  driftEnduring: (page = 1, size = 20) => get<DriftListResponse>(`/drift/enduring?page=${page}&page_size=${size}`),
};
