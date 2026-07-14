/** Dev-only fixture layer for building the UI without a backend.
 *
 * Active only in `vite dev` (import.meta.env.DEV) and opt-out via VITE_MOCK=0.
 * Stripped from production builds. `get()` in api.ts consults `mockResponse(path)`
 * first; an undefined result falls through to the real /api proxy. Add fixtures
 * here as each screen is built — an unmocked path simply shows the live API error.
 */

export const MOCK_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_MOCK !== "0";

// ── Fixtures (representative, not real data) ──

const datasets = {
  total_rows: 602645,
  datasets: [
    { dataset_name: "onet_occupations", version_key: "28.1", row_count: 1016, ingested_at: "2026-01-10" },
    { dataset_name: "eloundou_occ_scores", version_key: "2024", row_count: 923, ingested_at: "2026-01-10" },
    { dataset_name: "signal_source_registry", version_key: "2026.07.1", row_count: 18, ingested_at: "2026-07-14" },
    { dataset_name: "task_drift_metrics", version_key: "fr8.2", row_count: 4605, ingested_at: "2026-02-01" },
  ],
};

function sector(
  naics_code: string,
  naics_title: string,
  occupation_count: number,
  total_employment: number,
  beta: number,
  e0: number,
  e1: number,
  e2: number,
): Record<string, unknown> {
  const w = total_employment;
  return {
    naics_code,
    naics_title,
    occupation_count,
    total_employment,
    avg_eloundou_beta: beta,
    avg_ms_applicability: beta * 0.4,
    avg_aei_exposure: beta * 0.35,
    zone_e0_count: e0,
    zone_e1_count: e1,
    zone_e2_count: e2,
    weighted_eloundou_beta: beta + 0.02,
    weighted_ms_applicability: beta * 0.4,
    weighted_aei_exposure: beta * 0.35,
    workers_e0: Math.round(w * (e0 / (e0 + e1 + e2))),
    workers_e1: Math.round(w * (e1 / (e0 + e1 + e2))),
    workers_e2: Math.round(w * (e2 / (e0 + e1 + e2))),
    occupation_mix: null,
    subdivisions: null,
  };
}

const sectorsUS = {
  region: "US",
  total_sectors: 6,
  sectors: [
    sector("51", "Information", 210, 3_100_000, 0.71, 18, 140, 52),
    sector("54", "Professional & Technical Services", 340, 10_900_000, 0.63, 60, 210, 70),
    sector("52", "Finance & Insurance", 180, 6_400_000, 0.58, 44, 118, 18),
    sector("62", "Health Care & Social Assistance", 300, 20_100_000, 0.34, 190, 96, 14),
    sector("31", "Manufacturing", 260, 12_800_000, 0.41, 120, 118, 22),
    sector("23", "Construction", 150, 7_600_000, 0.22, 118, 30, 2),
  ],
};

// Distinct AU (ANZSIC) fixture — deliberately DIFFERENT codes/numbers from the
// US set, so a region toggle that's actually wired to region-specific data is
// visually obvious in the preview (catches "text changes, numbers don't").
const sectorsAU = {
  region: "AU",
  total_sectors: 5,
  sectors: [
    sector("J", "Information Media & Telecommunications", 60, 240_000, 0.66, 6, 30, 10),
    sector("K", "Financial & Insurance Services", 45, 470_000, 0.55, 14, 26, 5),
    sector("M", "Professional, Scientific & Technical Services", 95, 1_190_000, 0.58, 22, 58, 15),
    sector("Q", "Health Care & Social Assistance", 120, 1_870_000, 0.30, 78, 38, 4),
    sector("E", "Construction", 70, 1_260_000, 0.19, 55, 14, 1),
  ],
};

const search = {
  query: "engineer",
  total: 3,
  results: [
    {
      matched_title: "Software Developer",
      source: "onet",
      soc_code: "15-1252.00",
      occupation_title: "Software Developers",
      similarity: 0.94,
      eloundou_beta: 0.61,
      ms_ai_applicability: 0.38,
      aei_exposure: 0.29,
      dominant_zone: "E1",
      total_employment: 1_580_000,
      has_tasks: true,
      category: null,
    },
    {
      matched_title: "DevOps Engineer",
      source: "onet",
      soc_code: "15-1299.09",
      occupation_title: "Information Technology Project Managers",
      similarity: 0.61,
      eloundou_beta: 0.44,
      ms_ai_applicability: 0.22,
      aei_exposure: 0.19,
      dominant_zone: "E1",
      total_employment: 620_000,
      has_tasks: true,
      category: null,
    },
    {
      matched_title: "Engineers, All Other",
      source: "onet",
      soc_code: "17-2199.00",
      occupation_title: "Engineers, All Other",
      similarity: 0.41,
      eloundou_beta: null,
      ms_ai_applicability: null,
      aei_exposure: null,
      dominant_zone: null,
      total_employment: null,
      has_tasks: false,
      category: "residual",
    },
  ],
};

const driftSummary = {
  total_tasks: 4605,
  classified_tasks: 3533,
  departing: 558,
  enduring: 2971,
  below_threshold: 4,
  emerging: 0,
  unclassified: 1072,
  avg_velocity_departing: 0.012,
  avg_velocity_enduring: 0.001,
};

const driftDeparting = {
  tasks: [
    { task_text: "Draft routine correspondence and standard reports", velocity: 0.021, r_squared: 0.91, latest_task_pct: 0.42, peak_task_pct: 0.44, classification: "departing", snapshot_count: 4 },
    { task_text: "Summarise long documents into key points", velocity: 0.018, r_squared: 0.88, latest_task_pct: 0.38, peak_task_pct: 0.39, classification: "departing", snapshot_count: 4 },
  ],
  total: 2, page: 1, page_size: 15,
};

const driftBelowThreshold = {
  tasks: [
    { task_text: "Reconcile monthly expense reports against receipts", velocity: 0.009, r_squared: 0.83, latest_task_pct: 0.46, peak_task_pct: 0.46, classification: "below_threshold", snapshot_count: 4 },
  ],
  total: 1, page: 1, page_size: 20,
};

const driftEnduring = {
  tasks: [
    { task_text: "Resolve conflicts between team members", velocity: 0.0005, r_squared: 0.61, latest_task_pct: 0.08, peak_task_pct: 0.09, classification: "enduring", snapshot_count: 4 },
    { task_text: "Conduct in-person client relationship building", velocity: 0.0002, r_squared: 0.55, latest_task_pct: 0.05, peak_task_pct: 0.05, classification: "enduring", snapshot_count: 4 },
  ],
  total: 2, page: 1, page_size: 10,
};

// ── Router: base path → fixture. Most fixtures ignore the query string; a few
// (region-sensitive endpoints) read it — see the special cases below. ──

const TABLE: Record<string, unknown> = {
  "/datasets": datasets,
  "/search": search,
  "/drift/summary": driftSummary,
  "/drift/departing": driftDeparting,
  "/drift/below-threshold": driftBelowThreshold,
  "/drift/enduring": driftEnduring,
};

export function mockResponse(path: string): unknown | undefined {
  if (!MOCK_ENABLED) return undefined;
  const [base, query] = path.split("?");

  // Region-sensitive endpoints: return genuinely different fixtures per
  // region so a broken region toggle is visually obvious in the preview,
  // rather than silently serving the same numbers under a different label.
  if (base === "/sectors") {
    const region = new URLSearchParams(query).get("region");
    return region === "AU" ? sectorsAU : sectorsUS;
  }

  return TABLE[base];
}
