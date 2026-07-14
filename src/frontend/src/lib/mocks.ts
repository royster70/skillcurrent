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

const sectors = {
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

// ── Router: base path → fixture (query string ignored) ──

const TABLE: Record<string, unknown> = {
  "/datasets": datasets,
  "/sectors": sectors,
};

export function mockResponse(path: string): unknown | undefined {
  if (!MOCK_ENABLED) return undefined;
  const base = path.split("?")[0];
  return TABLE[base];
}
