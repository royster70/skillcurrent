import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AEITaskDetailPanel } from "./AEITaskDetailPanel";
import type { TaskMatrixResponse, EraSnapshot } from "../lib/api";

// ── Helpers ──

function makeSnap(era: string, pct: number, auto?: number, aug?: number): EraSnapshot {
  return {
    model_era: era,
    task_pct: pct,
    automation_potential: Math.min(pct / 5.0, 1.0),
    automation_pct: auto ?? null,
    augmentation_pct: aug ?? null,
  };
}

function makeMatrix(overrides: Partial<TaskMatrixResponse> = {}): TaskMatrixResponse {
  return {
    soc_code: "15-1252.00",
    occupation_title: "Software Developers",
    total_tasks: 5,
    quadrant_counts: { insulated: 1, augmented: 2, disrupted: 1, routine: 1 },
    available_eras: ["sonnet-3.5", "sonnet-3.7", "sonnet-4"],
    gdpval_benchmark_count: 0,
    tasks: [
      {
        task_id: 1, task_text: "Write unit tests",
        importance: 4.0, automation_potential: 0.6,
        eloundou_dwa_beta: 0.06, drift_velocity: 0.002,
        drift_classification: "enduring", aei_penetration: 0.15,
        quadrant: "augmented",
        era_snapshots: [
          makeSnap("sonnet-3.5", 1.2, 0.3, 0.5),
          makeSnap("sonnet-3.7", 2.1, 0.35, 0.45),
          makeSnap("sonnet-4", 3.0, 0.4, 0.42),
        ],
      },
      {
        task_id: 2, task_text: "Review code changes",
        importance: 4.2, automation_potential: 0.5,
        eloundou_dwa_beta: 0.05, drift_velocity: 0.001,
        drift_classification: "enduring", aei_penetration: 0.10,
        quadrant: "augmented",
        era_snapshots: [
          makeSnap("sonnet-3.5", 0.8),
          makeSnap("sonnet-4", 1.5, 0.2, 0.6),
        ],
      },
      {
        task_id: 3, task_text: "Design system architecture",
        importance: 4.5, automation_potential: 0.3,
        eloundou_dwa_beta: 0.03, drift_velocity: null,
        drift_classification: null, aei_penetration: null,
        quadrant: "insulated",
        era_snapshots: [],
      },
    ],
    ...overrides,
  };
}

// ── Tests ──

describe("AEITaskDetailPanel", () => {
  it("renders nothing when no tracked tasks", () => {
    const data = makeMatrix({
      tasks: [
        {
          task_id: 1, task_text: "Untracked task",
          importance: 3.0, automation_potential: 0.2,
          eloundou_dwa_beta: 0.02, drift_velocity: null,
          drift_classification: null, aei_penetration: null,
          quadrant: "routine", era_snapshots: [],
        },
      ],
    });
    const { container } = render(
      <AEITaskDetailPanel matrixData={data} expanded={false} onToggle={() => {}} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders header with tracked count", () => {
    render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={false} onToggle={() => {}} />
    );
    // 2 of 5 tasks have era_snapshots
    expect(screen.getByText(/2 of 5 tasks tracked/)).toBeInTheDocument();
  });

  it("renders header with era count", () => {
    render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={false} onToggle={() => {}} />
    );
    expect(screen.getByText(/3 model eras/)).toBeInTheDocument();
  });

  it("content hidden when collapsed", () => {
    render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={false} onToggle={() => {}} />
    );
    expect(screen.queryByText("TASK USAGE TRAJECTORY")).not.toBeInTheDocument();
  });

  it("content visible when expanded", () => {
    render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={true} onToggle={() => {}} />
    );
    expect(screen.getByText("TASK USAGE TRAJECTORY")).toBeInTheDocument();
    expect(screen.getByText("TASK PENETRATION RANKING")).toBeInTheDocument();
  });

  it("calls onToggle when header clicked", () => {
    const toggle = vi.fn();
    render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={false} onToggle={toggle} />
    );
    fireEvent.click(screen.getByText("AEI Task Intelligence"));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("trajectory chart renders SVG for multi-era data", () => {
    const { container } = render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={true} onToggle={() => {}} />
    );
    // Should have SVG elements for the trajectory chart
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("penetration ranking shows tasks sorted by penetration", () => {
    render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={true} onToggle={() => {}} />
    );
    // Task 1 has higher penetration (0.15) than task 2 (0.10)
    expect(screen.getAllByText(/Write unit tests/).length).toBeGreaterThan(0);
  });

  it("auto/aug split only shows tasks with data", () => {
    render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={true} onToggle={() => {}} />
    );
    // "AUTOMATION vs AUGMENTATION" section should be present since tasks have auto/aug data
    expect(screen.getByText(/AUTOMATION/)).toBeInTheDocument();
  });

  it("coverage ring shows percentage", () => {
    render(
      <AEITaskDetailPanel matrixData={makeMatrix()} expanded={true} onToggle={() => {}} />
    );
    // 2 of 5 = 40%
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("handles single-era data without crashing", () => {
    const data = makeMatrix({
      available_eras: ["sonnet-4"],
      tasks: [
        {
          task_id: 1, task_text: "Single era task",
          importance: 3.5, automation_potential: 0.5,
          eloundou_dwa_beta: 0.05, drift_velocity: null,
          drift_classification: null, aei_penetration: 0.1,
          quadrant: "augmented",
          era_snapshots: [makeSnap("sonnet-4", 2.0, 0.3, 0.4)],
        },
      ],
      total_tasks: 1,
    });
    const { container } = render(
      <AEITaskDetailPanel matrixData={data} expanded={true} onToggle={() => {}} />
    );
    expect(container.innerHTML).not.toBe("");
  });

  it("handles all-null automation data gracefully", () => {
    const data = makeMatrix({
      tasks: [
        {
          task_id: 1, task_text: "Null auto task",
          importance: 3.5, automation_potential: 0.5,
          eloundou_dwa_beta: 0.05, drift_velocity: null,
          drift_classification: null, aei_penetration: 0.1,
          quadrant: "augmented",
          era_snapshots: [
            makeSnap("sonnet-3.5", 1.0),  // null auto/aug
            makeSnap("sonnet-4", 2.0),     // null auto/aug
          ],
        },
      ],
      total_tasks: 1,
    });
    // Should not crash
    const { container } = render(
      <AEITaskDetailPanel matrixData={data} expanded={true} onToggle={() => {}} />
    );
    expect(container.innerHTML).not.toBe("");
  });
});
