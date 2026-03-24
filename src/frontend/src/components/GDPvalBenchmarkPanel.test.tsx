import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GDPvalBenchmarkPanel } from "./GDPvalBenchmarkPanel";
import type { GDPvalOccupationResponse } from "../lib/api";
import * as useApiModule from "../hooks/useApi";

// ── Mock the API module ──

const mockGDPvalData: GDPvalOccupationResponse = {
  soc_code: "15-1252.00",
  occupation_title: "Software Developers",
  sector: "Information",
  task_count: 3,
  tasks: [
    {
      task_id: "gdpval-001",
      prompt_summary: "Write a Python function to parse CSV files",
      rubric_item_count: 5,
      max_score: 3,
      min_score: -1,
      reference_file_count: 1,
      deliverable_file_count: 1,
      rubric_items: [
        { criterion: "Handles edge cases", score: 2, required: true, tags: ["correctness", "robustness"] },
        { criterion: "Uses standard library", score: 1, required: false, tags: ["best-practices"] },
        { criterion: "Missing error handling", score: -1, required: true, tags: ["correctness"] },
      ],
    },
    {
      task_id: "gdpval-002",
      prompt_summary: "Create a REST API endpoint",
      rubric_item_count: 4,
      max_score: 3,
      min_score: 0,
      reference_file_count: 0,
      deliverable_file_count: 1,
      rubric_items: [
        { criterion: "Returns correct status codes", score: 3, required: true, tags: null },
        { criterion: "Input validation", score: 1, required: true, tags: ["security"] },
      ],
    },
    {
      task_id: "gdpval-003",
      prompt_summary: "Optimise database query",
      rubric_item_count: 3,
      max_score: 2,
      min_score: 0,
      reference_file_count: 2,
      deliverable_file_count: 0,
      rubric_items: [
        { criterion: "Query plan improved", score: 2, required: false, tags: ["performance"] },
      ],
    },
  ],
};

vi.mock("../hooks/useApi", () => ({
  useApi: vi.fn((fetcher: () => Promise<unknown>, deps: unknown[]) => {
    // When expanded (second dep is true), return mock data; otherwise null
    const expanded = deps?.[1];
    if (expanded) {
      return { data: mockGDPvalData, loading: false, error: null };
    }
    return { data: null, loading: false, error: null };
  }),
}));

// ── Tests ──

describe("GDPvalBenchmarkPanel", () => {
  it("renders header with task count", () => {
    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={false} onToggle={() => {}} />
    );
    expect(screen.getByText(/5 real-world tasks/)).toBeInTheDocument();
  });

  it("renders GDPval Benchmark title", () => {
    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={false} onToggle={() => {}} />
    );
    expect(screen.getByText("GDPval Benchmark")).toBeInTheDocument();
  });

  it("content hidden when collapsed", () => {
    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={false} onToggle={() => {}} />
    );
    expect(screen.queryByText("TASK SCORE RANGES")).not.toBeInTheDocument();
  });

  it("renders score ranges when expanded with data", () => {
    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={true} onToggle={() => {}} />
    );
    expect(screen.getByText("TASK SCORE RANGES")).toBeInTheDocument();
  });

  it("renders rubric composition ring when expanded", () => {
    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={true} onToggle={() => {}} />
    );
    expect(screen.getByText("RUBRIC COMPOSITION")).toBeInTheDocument();
  });

  it("renders evaluation categories when tags present", () => {
    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={true} onToggle={() => {}} />
    );
    expect(screen.getByText("EVALUATION CATEGORIES")).toBeInTheDocument();
  });

  it("calls onToggle when header clicked", () => {
    const toggle = vi.fn();
    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={false} onToggle={toggle} />
    );
    fireEvent.click(screen.getByText("GDPval Benchmark"));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it("score range chart shows task prompts", () => {
    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={true} onToggle={() => {}} />
    );
    // Task summaries should appear (truncated)
    expect(screen.getByText(/Write a Python function/)).toBeInTheDocument();
  });

  it("renders SVG elements for charts", () => {
    const { container } = render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={true} onToggle={() => {}} />
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("handles loading state", () => {
    // Override mock to simulate loading
    vi.spyOn(useApiModule, "useApi").mockReturnValueOnce({ data: null, loading: true, error: null });

    render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={true} onToggle={() => {}} />
    );
    expect(screen.getByText(/Loading benchmark data/)).toBeInTheDocument();
  });

  it("handles API error without crashing", () => {
    vi.spyOn(useApiModule, "useApi").mockReturnValueOnce({ data: null, loading: false, error: "Network error" });

    const { container } = render(
      <GDPvalBenchmarkPanel socCode="15-1252.00" taskCount={5} expanded={true} onToggle={() => {}} />
    );
    // Should not crash — container should have content
    expect(container.innerHTML).not.toBe("");
  });
});
