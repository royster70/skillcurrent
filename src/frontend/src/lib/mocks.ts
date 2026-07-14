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

// Rich enough to preview the Rising Tide page: varied usage levels and paces
// (fractions 0–1; velocity = usage-share change per model era).
// `families` = SOC major-group display names the task appears in (representative;
// the real backend join is a follow-on). Many-to-many — Office & Admin recurs.
const driftDeparting = {
  tasks: [
    { task_text: "Draft routine correspondence and standard reports", velocity: 0.021, r_squared: 0.91, latest_task_pct: 0.42, peak_task_pct: 0.44, classification: "departing", snapshot_count: 4, families: ["Office & Admin", "Business & Finance", "Legal"] },
    { task_text: "Summarise long documents into key points", velocity: 0.018, r_squared: 0.88, latest_task_pct: 0.38, peak_task_pct: 0.39, classification: "departing", snapshot_count: 4, families: ["Legal", "Business & Finance", "Management"] },
    { task_text: "Write boilerplate code from specifications", velocity: 0.024, r_squared: 0.94, latest_task_pct: 0.35, peak_task_pct: 0.35, classification: "departing", snapshot_count: 4, families: ["Computer & Mathematical"] },
    { task_text: "Translate documents between languages", velocity: 0.016, r_squared: 0.86, latest_task_pct: 0.31, peak_task_pct: 0.32, classification: "departing", snapshot_count: 4, families: ["Media & Communications", "Office & Admin"] },
    { task_text: "Prepare meeting minutes and action summaries", velocity: 0.013, r_squared: 0.79, latest_task_pct: 0.27, peak_task_pct: 0.27, classification: "departing", snapshot_count: 4, families: ["Office & Admin", "Management"] },
    { task_text: "Compile data into standard report formats", velocity: 0.011, r_squared: 0.74, latest_task_pct: 0.22, peak_task_pct: 0.23, classification: "departing", snapshot_count: 3, families: ["Business & Finance", "Office & Admin"] },
    { task_text: "Answer routine customer enquiries in writing", velocity: 0.009, r_squared: 0.68, latest_task_pct: 0.17, peak_task_pct: 0.17, classification: "departing", snapshot_count: 4, families: ["Office & Admin", "Sales"] },
    { task_text: "Proofread and edit written material", velocity: 0.008, r_squared: 0.71, latest_task_pct: 0.14, peak_task_pct: 0.15, classification: "departing", snapshot_count: 3, families: ["Media & Communications", "Office & Admin"] },
    { task_text: "Schedule appointments and coordinate calendars", velocity: 0.006, r_squared: 0.58, latest_task_pct: 0.09, peak_task_pct: 0.09, classification: "departing", snapshot_count: 4, families: ["Office & Admin"] },
    { task_text: "Categorise and file digital records", velocity: 0.005, r_squared: 0.52, latest_task_pct: 0.06, peak_task_pct: 0.06, classification: "departing", snapshot_count: 3, families: ["Office & Admin"] },
  ],
  total: 10, page: 1, page_size: 15,
};

const driftBelowThreshold = {
  tasks: [
    { task_text: "Reconcile monthly expense reports against receipts", velocity: 0.009, r_squared: 0.83, latest_task_pct: 0.46, peak_task_pct: 0.46, classification: "below_threshold", snapshot_count: 4, families: ["Business & Finance", "Office & Admin"] },
    { task_text: "Generate first-draft marketing copy variants", velocity: 0.012, r_squared: 0.87, latest_task_pct: 0.44, peak_task_pct: 0.44, classification: "below_threshold", snapshot_count: 4, families: ["Media & Communications", "Sales"] },
    { task_text: "Produce standard client status updates", velocity: 0.007, r_squared: 0.66, latest_task_pct: 0.43, peak_task_pct: 0.45, classification: "below_threshold", snapshot_count: 4, families: ["Business & Finance", "Management"] },
    { task_text: "Draft simple contracts from templates", velocity: 0.005, r_squared: 0.49, latest_task_pct: 0.41, peak_task_pct: 0.41, classification: "below_threshold", snapshot_count: 3, families: ["Legal", "Business & Finance"] },
  ],
  total: 4, page: 1, page_size: 20,
};

const driftEnduring = {
  tasks: [
    { task_text: "Resolve conflicts between team members", velocity: 0.0005, r_squared: 0.61, latest_task_pct: 0.08, peak_task_pct: 0.09, classification: "enduring", snapshot_count: 4, families: ["Management", "Office & Admin"] },
    { task_text: "Conduct in-person client relationship building", velocity: 0.0002, r_squared: 0.55, latest_task_pct: 0.05, peak_task_pct: 0.05, classification: "enduring", snapshot_count: 4, families: ["Sales", "Management"] },
    { task_text: "Mentor and coach junior colleagues", velocity: -0.0003, r_squared: 0.48, latest_task_pct: 0.07, peak_task_pct: 0.08, classification: "enduring", snapshot_count: 4, families: ["Management", "Education"] },
    { task_text: "Negotiate terms with suppliers and partners", velocity: 0.0008, r_squared: 0.42, latest_task_pct: 0.06, peak_task_pct: 0.06, classification: "enduring", snapshot_count: 4, families: ["Business & Finance", "Management"] },
    { task_text: "Lead physical site inspections", velocity: -0.0001, r_squared: 0.39, latest_task_pct: 0.03, peak_task_pct: 0.04, classification: "enduring", snapshot_count: 3, families: ["Construction & Trades", "Management"] },
    { task_text: "Facilitate workshops and group decision-making", velocity: 0.0011, r_squared: 0.57, latest_task_pct: 0.12, peak_task_pct: 0.12, classification: "enduring", snapshot_count: 4, families: ["Management", "Education"] },
  ],
  total: 6, page: 1, page_size: 10,
};

// ── Occupations: hierarchy + per-SOC detail/matrix (the Task Waterline) ──

const MODEL_ERAS = ["GPT-3.5", "GPT-4", "Claude 3.5", "Claude 4"];

// One occupation's tasks, curated to span the whole Beta scale so the waterline
// reads at a glance: code/paperwork sinks (E2), analysis is at the surface (E1),
// people-work stays dry (E0). `beta` is the real per-task exposure; `trend` seeds
// the era snapshots (rising = the current moving into the task).
interface TaskSeed {
  text: string;
  beta: number; // 0–1.5 exposure
  importance: number; // 1–5 human/role value
  trend: "rising" | "steady" | "falling";
  drift: "departing" | "enduring" | "below_threshold" | null;
}

const SOFTWARE_DEVELOPER_TASKS: TaskSeed[] = [
  { text: "Write, update, and maintain application code from specifications", beta: 0.94, importance: 4.6, trend: "rising", drift: "departing" },
  { text: "Modify existing software to correct errors or improve performance", beta: 0.9, importance: 4.2, trend: "rising", drift: "departing" },
  { text: "Generate unit tests and boilerplate scaffolding", beta: 0.88, importance: 3.1, trend: "rising", drift: "departing" },
  { text: "Write technical documentation for programs and APIs", beta: 0.81, importance: 3.4, trend: "rising", drift: "departing" },
  { text: "Develop and direct software validation and testing procedures", beta: 0.66, importance: 4.1, trend: "steady", drift: "enduring" },
  { text: "Analyze user needs and translate them into software requirements", beta: 0.55, importance: 4.7, trend: "steady", drift: "enduring" },
  { text: "Design the architecture and data model for new applications", beta: 0.5, importance: 4.9, trend: "steady", drift: "enduring" },
  { text: "Review colleagues' code and enforce engineering standards", beta: 0.41, importance: 4.3, trend: "rising", drift: "below_threshold" },
  { text: "Coordinate release planning with product and stakeholders", beta: 0.3, importance: 4.0, trend: "steady", drift: "enduring" },
  { text: "Mentor junior developers and grow the team's skills", beta: 0.22, importance: 4.4, trend: "steady", drift: "enduring" },
  { text: "Present technical trade-offs to non-technical leadership", beta: 0.17, importance: 4.2, trend: "steady", drift: "enduring" },
];

// A neutral fallback set for any occupation that isn't specifically curated —
// still spans the scale so every occupation renders a legible waterline.
const GENERIC_TASKS: TaskSeed[] = [
  { text: "Compile and format routine reports and records", beta: 0.89, importance: 3.2, trend: "rising", drift: "departing" },
  { text: "Enter and reconcile data across systems", beta: 0.83, importance: 3.0, trend: "rising", drift: "departing" },
  { text: "Draft standard correspondence and summaries", beta: 0.72, importance: 3.3, trend: "rising", drift: "departing" },
  { text: "Analyze information to inform recommendations", beta: 0.54, importance: 4.2, trend: "steady", drift: "enduring" },
  { text: "Plan and schedule the sequence of work", beta: 0.43, importance: 3.9, trend: "steady", drift: "enduring" },
  { text: "Coordinate with colleagues and external partners", beta: 0.28, importance: 4.1, trend: "steady", drift: "enduring" },
  { text: "Resolve disputes and negotiate outcomes", beta: 0.16, importance: 4.3, trend: "steady", drift: "enduring" },
];

const CURATED_TASKS: Record<string, TaskSeed[]> = {
  "15-1252.00": SOFTWARE_DEVELOPER_TASKS,
};

// Real titles for every occupation reachable from the hierarchy fixture, so the
// detail header matches the sidebar even for the generic-task fallback roles.
const OCC_TITLES: Record<string, string> = {
  "15-1252.00": "Software Developers",
  "15-1211.00": "Computer Systems Analysts",
  "15-2051.00": "Data Scientists",
  "29-1141.00": "Registered Nurses",
  "29-1215.00": "Family Medicine Physicians",
  "43-3031.00": "Bookkeeping & Accounting Clerks",
  "43-4051.00": "Customer Service Representatives",
};

function eraSnapshots(seed: TaskSeed) {
  // Latest usage rises with exposure; the trend shapes the slope across eras.
  const latest = Math.min(seed.beta * 0.6, 0.9);
  const slope = seed.trend === "rising" ? 0.7 : seed.trend === "falling" ? -0.4 : 0.05;
  const auto = Math.min(seed.beta, 1);
  return MODEL_ERAS.map((era, i) => {
    const frac = i / (MODEL_ERAS.length - 1);
    const start = latest * (1 - slope);
    const pct = Math.max(0, start + (latest - start) * frac);
    return {
      model_era: era,
      task_pct: Number(pct.toFixed(3)),
      automation_potential: auto,
      automation_pct: Number((auto * 0.6).toFixed(2)),
      augmentation_pct: Number((auto * 0.4).toFixed(2)),
    };
  });
}

function quadrantOf(beta: number, importance: number): string {
  const highExposure = beta >= 0.4;
  const highValue = importance >= 3.5;
  if (highValue && !highExposure) return "insulated";
  if (highValue && highExposure) return "augmented";
  if (!highValue && highExposure) return "disrupted";
  return "routine";
}

function occMatrix(soc: string) {
  const seeds = CURATED_TASKS[soc] ?? GENERIC_TASKS;
  const tasks = seeds.map((s, i) => ({
    task_id: i + 1,
    task_text: s.text,
    importance: s.importance,
    automation_potential: Math.min(s.beta, 1),
    eloundou_dwa_beta: s.beta,
    drift_velocity: s.trend === "rising" ? 0.018 : s.trend === "falling" ? -0.01 : 0.001,
    drift_classification: s.drift,
    aei_penetration: Math.min(s.beta * 0.5, 0.9),
    quadrant: quadrantOf(s.beta, s.importance),
    era_snapshots: eraSnapshots(s),
  }));
  const quadrant_counts: Record<string, number> = { insulated: 0, augmented: 0, disrupted: 0, routine: 0 };
  tasks.forEach((t) => { quadrant_counts[t.quadrant] += 1; });
  return {
    soc_code: soc,
    occupation_title: OCC_TITLES[soc] ?? "Occupation",
    tasks,
    total_tasks: tasks.length,
    quadrant_counts,
    available_eras: MODEL_ERAS,
    gdpval_benchmark_count: soc === "15-1252.00" ? 4 : 0,
  };
}

function occDetail(soc: string) {
  const isDev = soc === "15-1252.00";
  return {
    soc_code: soc,
    title: OCC_TITLES[soc] ?? "Occupation",
    description: isDev
      ? "Research, design, and develop computer and network software or specialized utility programs."
      : null,
    major_group: soc.substring(0, 2) + "-0000",
    eloundou_beta_gpt4: isDev ? 0.61 : 0.5,
    eloundou_beta_human: isDev ? 0.58 : 0.48,
    ms_ai_applicability: isDev ? 0.38 : 0.3,
    aei_exposure: isDev ? 0.29 : 0.22,
    dominant_zone: "E1",
    total_employment: isDev ? 1_580_000 : 240_000,
    top_sectors: [
      { naics_code: "51", naics_title: "Information", headcount: 520_000, employment_share: 0.33 },
      { naics_code: "54", naics_title: "Professional & Technical Services", headcount: 610_000, employment_share: 0.39 },
      { naics_code: "52", naics_title: "Finance & Insurance", headcount: 190_000, employment_share: 0.12 },
    ],
    drift_velocity: 0.006,
    drift_classification: "enduring",
    eloundou_percentile: 72,
    ms_ai_percentile: 64,
    aei_percentile: 58,
    eloundou_median: 0.27,
    ms_ai_median: 0.19,
    aei_median: 0.14,
    eloundou_population: 923,
    ms_ai_population: 785,
    aei_population: 756,
    aei_era_snapshots: MODEL_ERAS.map((era, i) => ({
      model_era: era,
      avg_task_pct: Number((0.05 + i * 0.04).toFixed(3)),
      task_count: 11,
    })),
    gdpval_task_count: isDev ? 4 : 0,
    gdpval_available: isDev,
  };
}

const hierarchy = {
  total_major_groups: 3,
  total_occupations: 1016,
  hierarchy: [
    {
      code: "15-0000", title: "Computer & Mathematical", level: "major",
      occupation_count: 3, avg_eloundou_beta: 0.58, total_employment: 4_900_000,
      children: [
        { code: "15-1252.00", title: "Software Developers", level: "detailed", children: [], occupation_count: 0, avg_eloundou_beta: 0.61, total_employment: 1_580_000 },
        { code: "15-1211.00", title: "Computer Systems Analysts", level: "detailed", children: [], occupation_count: 0, avg_eloundou_beta: 0.55, total_employment: 520_000 },
        { code: "15-2051.00", title: "Data Scientists", level: "detailed", children: [], occupation_count: 0, avg_eloundou_beta: 0.6, total_employment: 200_000 },
      ],
    },
    {
      code: "29-0000", title: "Healthcare Practitioners", level: "major",
      occupation_count: 2, avg_eloundou_beta: 0.31, total_employment: 9_200_000,
      children: [
        { code: "29-1141.00", title: "Registered Nurses", level: "detailed", children: [], occupation_count: 0, avg_eloundou_beta: 0.33, total_employment: 3_170_000 },
        { code: "29-1215.00", title: "Family Medicine Physicians", level: "detailed", children: [], occupation_count: 0, avg_eloundou_beta: 0.29, total_employment: 120_000 },
      ],
    },
    {
      code: "43-0000", title: "Office & Administrative Support", level: "major",
      occupation_count: 2, avg_eloundou_beta: 0.64, total_employment: 18_600_000,
      children: [
        { code: "43-3031.00", title: "Bookkeeping & Accounting Clerks", level: "detailed", children: [], occupation_count: 0, avg_eloundou_beta: 0.7, total_employment: 1_620_000 },
        { code: "43-4051.00", title: "Customer Service Representatives", level: "detailed", children: [], occupation_count: 0, avg_eloundou_beta: 0.62, total_employment: 2_890_000 },
      ],
    },
  ],
};

const gdpvalSummary = {
  total_tasks: 220,
  total_occupations: 44,
  total_rubric_items: 10453,
  sectors: ["Information", "Professional & Technical Services", "Finance & Insurance"],
  occupations: [
    { soc_code: "15-1252.00", title: "Software Developers", sector: "Information", task_count: 4 },
  ],
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
  "/occupations/hierarchy": hierarchy,
  "/gdpval/summary": gdpvalSummary,
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

  // Per-SOC occupation routes (checked before the static TABLE catches the
  // literal /occupations/hierarchy above). Matrix must match before detail.
  const matrixMatch = base.match(/^\/occupations\/([^/]+)\/matrix$/);
  if (matrixMatch) return occMatrix(matrixMatch[1]);
  const detailMatch = base.match(/^\/occupations\/([^/]+)$/);
  if (detailMatch && detailMatch[1] !== "hierarchy") return occDetail(detailMatch[1]);

  return TABLE[base];
}
