import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ZoneExplainerPanel } from "./ZoneExplainerPanel";

describe("ZoneExplainerPanel", () => {
  it("renders collapsed by default", () => {
    const { container } = render(<ZoneExplainerPanel />);
    expect(screen.getByText("Understanding Exposure Zones")).toBeInTheDocument();
    // Body container has maxHeight: 0 when collapsed
    const body = container.querySelector('[style*="max-height: 0"]') ||
                 container.querySelector('[style*="max-height:0"]');
    expect(body).toBeTruthy();
  });

  it("shows three zone colour pips in header", () => {
    const { container } = render(<ZoneExplainerPanel />);
    // Three 8px circles for zone colours
    const pips = container.querySelectorAll('div[title^="E"]');
    expect(pips.length).toBe(3);
  });

  it("shows subtitle question in header", () => {
    render(<ZoneExplainerPanel />);
    expect(screen.getByText("What do E0, E1, E2 mean?")).toBeInTheDocument();
  });

  it("expands on header click", () => {
    render(<ZoneExplainerPanel />);
    fireEvent.click(screen.getByText("Understanding Exposure Zones"));
    expect(screen.getByText("E0 — Insulated")).toBeVisible();
    expect(screen.getByText("E1 — Augmented")).toBeVisible();
    expect(screen.getByText("E2 — Automated")).toBeVisible();
  });

  it("collapses on second click", () => {
    const { container } = render(<ZoneExplainerPanel />);
    const header = screen.getByText("Understanding Exposure Zones");
    fireEvent.click(header); // expand
    expect(screen.getByText("E0 — Insulated")).toBeInTheDocument();
    fireEvent.click(header); // collapse
    // Body container returns to maxHeight: 0
    const body = container.querySelector('[style*="max-height: 0"]') ||
                 container.querySelector('[style*="max-height:0"]');
    expect(body).toBeTruthy();
  });

  it("shows correct zone labels", () => {
    render(<ZoneExplainerPanel defaultExpanded />);
    expect(screen.getByText("E0 — Insulated")).toBeInTheDocument();
    expect(screen.getByText("E1 — Augmented")).toBeInTheDocument();
    expect(screen.getByText("E2 — Automated")).toBeInTheDocument();
  });

  it("shows Beta formula text", () => {
    render(<ZoneExplainerPanel defaultExpanded />);
    expect(
      screen.getByText(/Beta = E1 \+ 0\.5×E2/)
    ).toBeInTheDocument();
  });

  it("shows threshold ranges", () => {
    render(<ZoneExplainerPanel defaultExpanded />);
    expect(screen.getByText("Beta < 0.40")).toBeInTheDocument();
    expect(screen.getByText(/Beta 0\.40/)).toBeInTheDocument();
    expect(screen.getByText(/Beta ≥ 0\.85/)).toBeInTheDocument();
  });

  it("shows zone descriptions", () => {
    render(<ZoneExplainerPanel defaultExpanded />);
    expect(screen.getByText("Human-only work")).toBeInTheDocument();
    expect(screen.getByText("AI assists, human leads")).toBeInTheDocument();
    expect(screen.getByText("AI performs, human validates")).toBeInTheDocument();
  });

  it("accepts defaultExpanded prop", () => {
    render(<ZoneExplainerPanel defaultExpanded />);
    // Should be expanded immediately — zone definitions visible
    expect(screen.getByText("E0 — Insulated")).toBeVisible();
  });

  it("has correct aria attributes", () => {
    const { container } = render(<ZoneExplainerPanel />);
    const button = container.querySelector('[role="button"]');
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button!);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
