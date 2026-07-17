import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OccupationSummaryPanel } from "./OccupationSummaryPanel";
import { LEXICONS } from "../lib/lexicon";
import { AudienceProvider } from "../lib/audience";
import { AUDIENCE_LEXICONS } from "../lib/audience-lexicon";
import type { OccupationDetail, TaskMatrixResponse, TaskMatrixPoint, BearingsResponse } from "../lib/api";

// ── Fixtures ──

function makeOcc(overrides: Partial<OccupationDetail> = {}): OccupationDetail {
  return {
    soc_code: "29-1141.00",
    title: "Registered Nurse",
    description: null,
    major_group: "29-0000",
    eloundou_beta_gpt4: 0.3,
    eloundou_beta_human: null,
    ms_ai_applicability: null,
    aei_exposure: null,
    dominant_zone: "E0",
    total_employment: 3_000_000,
    top_sectors: [],
    drift_velocity: null,
    drift_classification: null,
    eloundou_percentile: null,
    ms_ai_percentile: null,
    aei_percentile: null,
    eloundou_median: null,
    ms_ai_median: null,
    aei_median: null,
    eloundou_population: null,
    ms_ai_population: null,
    aei_population: null,
    aei_era_snapshots: [],
    gdpval_task_count: 0,
    gdpval_available: false,
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskMatrixPoint> = {}): TaskMatrixPoint {
  return {
    task_id: 1,
    task_text: "Chart patient vitals",
    importance: 3,
    automation_potential: null,
    eloundou_dwa_beta: 0.1,
    drift_velocity: null,
    drift_classification: null,
    aei_penetration: null,
    quadrant: null,
    era_snapshots: [],
    ...overrides,
  };
}

function makeMatrix(tasks: TaskMatrixPoint[]): TaskMatrixResponse {
  return {
    soc_code: "29-1141.00",
    occupation_title: "Registered Nurse",
    tasks,
    total_tasks: tasks.length,
    quadrant_counts: {},
    available_eras: [],
    gdpval_benchmark_count: 0,
  };
}

function makeBearings(overrides: Partial<BearingsResponse> = {}): BearingsResponse {
  return {
    soc_code: "29-1141.00",
    title: "Registered Nurse",
    source_beta: 0.3,
    high_ground: [],
    adjacent: [],
    ...overrides,
  };
}

function renderPanel(props: { occ: OccupationDetail; matrixData: TaskMatrixResponse; bearings: BearingsResponse | null }) {
  return render(
    <MemoryRouter>
      <OccupationSummaryPanel {...props} />
    </MemoryRouter>,
  );
}

// ── Tests ──

beforeEach(() => {
  window.localStorage.clear();
});

describe("OccupationSummaryPanel", () => {
  it("leads with a mostly-dry reading when the role's weight sits below the waterline", () => {
    const matrixData = makeMatrix([
      makeTask({ task_text: "Comfort a distressed patient", eloundou_dwa_beta: 0.1, importance: 5 }),
      makeTask({ task_text: "Coordinate care with the team", eloundou_dwa_beta: 0.15, importance: 5 }),
    ]);
    renderPanel({ occ: makeOcc(), matrixData, bearings: makeBearings() });
    // Default mode is plain (#79) — the lead comes from the plain lexicon.
    expect(screen.getByText(LEXICONS.plain.leads.hold)).toBeInTheDocument();
  });

  it("lists the highest-importance at-or-below-waterline tasks under \"Use AI for, now\"", () => {
    const matrixData = makeMatrix([
      makeTask({ task_text: "Draft routine discharge notes", eloundou_dwa_beta: 0.6, importance: 5 }),
      makeTask({ task_text: "Summarise shift handover records", eloundou_dwa_beta: 0.5, importance: 3 }),
      makeTask({ task_text: "Comfort a distressed patient", eloundou_dwa_beta: 0.05, importance: 5 }), // dry — excluded
    ]);
    renderPanel({ occ: makeOcc(), matrixData, bearings: makeBearings() });
    expect(screen.getByText("Draft routine discharge notes")).toBeInTheDocument();
    expect(screen.getByText("Summarise shift handover records")).toBeInTheDocument();
    expect(screen.queryByText("Comfort a distressed patient")).not.toBeInTheDocument();
  });

  it("shows a loading note under \"Keep human control over\" while bearings is still fetching", () => {
    renderPanel({ occ: makeOcc(), matrixData: makeMatrix([makeTask()]), bearings: null });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("lists the bearings endpoint's high-ground DWAs once loaded", () => {
    const bearings = makeBearings({
      high_ground: [
        { dwa_id: "d1", dwa_title: "Provide emotional support to patients", beta: 0.05, importance_weight: 4 },
        { dwa_id: "d2", dwa_title: "Coordinate with care team", beta: 0.08, importance_weight: 3 },
      ],
    });
    renderPanel({ occ: makeOcc(), matrixData: makeMatrix([makeTask()]), bearings });
    expect(screen.getByText("Provide emotional support to patients")).toBeInTheDocument();
    expect(screen.getByText("Coordinate with care team")).toBeInTheDocument();
  });

  it("lists rising (departing) tasks under \"Prepare for next\", falling back to surfacing ones", () => {
    const matrixData = makeMatrix([
      makeTask({ task_text: "Rising task A", drift_classification: "departing", drift_velocity: 0.02 }),
      makeTask({ task_text: "Rising task B", drift_classification: "departing", drift_velocity: 0.05 }),
      makeTask({ task_text: "New task C", drift_classification: "emerging" }),
      makeTask({ task_text: "Steady task D", drift_classification: "enduring" }),
    ]);
    renderPanel({ occ: makeOcc(), matrixData, bearings: makeBearings() });
    // Higher velocity first
    const order = [...document.querySelectorAll("body *")]
      .map((el) => el.textContent)
      .filter((t): t is string => !!t && ["Rising task A", "Rising task B", "New task C"].includes(t));
    expect(order.indexOf("Rising task B")).toBeLessThan(order.indexOf("Rising task A"));
    expect(screen.getByText("Rising task B")).toBeInTheDocument();
    expect(screen.queryByText("Steady task D")).not.toBeInTheDocument();
  });

  it("shows a quiet fallback when nothing in the role is rising", () => {
    const matrixData = makeMatrix([makeTask({ task_text: "Steady task", drift_classification: "enduring" })]);
    renderPanel({ occ: makeOcc(), matrixData, bearings: makeBearings() });
    expect(screen.getByText("Nothing in this role is rising notably right now.")).toBeInTheDocument();
  });

  it("lists only the evidence sources actually present for this occupation", () => {
    const occ = makeOcc({ eloundou_beta_gpt4: 0.3, ms_ai_applicability: null, aei_exposure: null });
    renderPanel({ occ, matrixData: makeMatrix([makeTask()]), bearings: makeBearings() });
    expect(screen.getByText(/Evidence: Eloundou/)).toBeInTheDocument();
    expect(screen.queryByText(/Microsoft/)).not.toBeInTheDocument();
  });

  it("shows the ConfidenceBadge when the payload carries signal_coverage (#73)", () => {
    const occ = makeOcc({
      eloundou_beta_gpt4: 0.3,
      ms_ai_applicability: 0.2,
      aei_exposure: null,
      signal_coverage: {
        eloundou: true, microsoft: true, aei: false, gdpval: false,
        signal_count: 2, confidence: "moderate",
      },
    });
    renderPanel({ occ, matrixData: makeMatrix([makeTask()]), bearings: makeBearings() });
    expect(screen.getByText(/Evidence: 2 of 3 signals · Moderate confidence/)).toBeInTheDocument();
    // The plain-list fallback is replaced, not doubled
    expect(screen.queryByText(/Evidence: Eloundou,/)).not.toBeInTheDocument();
  });

  it("falls back to the plain evidence list when signal_coverage is absent (pre-regen static payloads)", () => {
    const occ = makeOcc({ eloundou_beta_gpt4: 0.3, signal_coverage: undefined });
    renderPanel({ occ, matrixData: makeMatrix([makeTask()]), bearings: makeBearings() });
    expect(screen.getByText(/Evidence: Eloundou/)).toBeInTheDocument();
    expect(screen.queryByText(/of 3 signals/)).not.toBeInTheDocument();
  });

  it("separates current evidence from future implication, and links to the methodology page", () => {
    renderPanel({ occ: makeOcc(), matrixData: makeMatrix([makeTask()]), bearings: makeBearings() });
    expect(screen.getByText(/reflect today's measured exposure/)).toBeInTheDocument();
    expect(screen.getByText(/reflects rising usage across model eras — a direction, not a certainty/)).toBeInTheDocument();
    const link = screen.getByText("how these are combined →");
    expect(link.closest("a")).toHaveAttribute("href", "/methodology#observed-vs-theoretical");
  });

  it("reframes eyebrow, column headings and order for the education audience (#86)", () => {
    window.localStorage.setItem("sc.audienceMode", "education");
    render(
      <MemoryRouter>
        <AudienceProvider>
          <OccupationSummaryPanel occ={makeOcc()} matrixData={makeMatrix([makeTask()])} bearings={makeBearings()} />
        </AudienceProvider>
      </MemoryRouter>,
    );
    // Education eyebrow + relabelled columns
    expect(screen.getByText(AUDIENCE_LEXICONS.education.summary.eyebrow)).toBeInTheDocument();
    expect(screen.getByText("Keep teaching deeply")).toBeInTheDocument();
    expect(screen.getByText("Add to the curriculum")).toBeInTheDocument();
    // Individual's wording is gone
    expect(screen.queryByText("Use AI for, now")).not.toBeInTheDocument();
    // Education leads with the durable-skills column
    const headings = screen.getAllByText(
      /Keep teaching deeply|Add to the curriculum|Teach AI-collaboration for/,
    );
    expect(headings[0].textContent).toBe("Keep teaching deeply");
  });
});
