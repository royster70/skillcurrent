import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ZoneExplorer, ZoneLegend } from "./ZoneExplorer";

describe("ZoneExplorer", () => {
  it("shows correct zone labels", () => {
    render(<ZoneExplorer />);
    expect(screen.getByText("E0 — Insulated")).toBeInTheDocument();
    expect(screen.getByText("E1 — Augmented")).toBeInTheDocument();
    expect(screen.getByText("E2 — Automated")).toBeInTheDocument();
  });

  it("shows threshold ranges", () => {
    render(<ZoneExplorer />);
    expect(screen.getByText("Beta < 0.40")).toBeInTheDocument();
    expect(screen.getByText(/Beta 0\.40/)).toBeInTheDocument();
    expect(screen.getByText(/Beta ≥ 0\.85/)).toBeInTheDocument();
  });

  it("shows zone headlines", () => {
    render(<ZoneExplorer />);
    expect(screen.getByText("Human-only work")).toBeInTheDocument();
    expect(screen.getByText("AI assists, human leads")).toBeInTheDocument();
    expect(screen.getByText("AI performs, human validates")).toBeInTheDocument();
  });

  it("shows Beta formula text", () => {
    render(<ZoneExplorer />);
    expect(screen.getByText(/Beta = E1 \+ 0\.5×E2/)).toBeInTheDocument();
  });

  it("shows typical task examples per zone", () => {
    render(<ZoneExplorer />);
    expect(screen.getByText(/Conflict mediation/)).toBeInTheDocument();
    expect(screen.getByText(/code scaffolding/)).toBeInTheDocument();
    expect(screen.getByText(/transcription/)).toBeInTheDocument();
  });

  it("renders the gauge as an aria slider at the median", () => {
    render(<ZoneExplorer />);
    const slider = screen.getByRole("slider", { name: "Beta value" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.27");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "1.5");
  });

  it("jumps the gauge when a zone card is clicked", () => {
    render(<ZoneExplorer />);
    fireEvent.click(screen.getByText("E2 — Automated"));
    const slider = screen.getByRole("slider", { name: "Beta value" });
    expect(slider).toHaveAttribute("aria-valuenow", "1.05");
  });

  it("moves the gauge with arrow keys", () => {
    render(<ZoneExplorer />);
    const slider = screen.getByRole("slider", { name: "Beta value" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.32");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.27");
  });

  it("labels the anchor points as illustrative", () => {
    render(<ZoneExplorer />);
    expect(screen.getByText(/illustrative reference points, not live-computed/)).toBeInTheDocument();
  });
});

describe("ZoneLegend", () => {
  it("shows three zone pips with labels", () => {
    const { container } = render(
      <MemoryRouter>
        <ZoneLegend />
      </MemoryRouter>,
    );
    const pips = container.querySelectorAll('span[title^="E"]');
    expect(pips.length).toBe(3);
    expect(screen.getByText("Insulated")).toBeInTheDocument();
    expect(screen.getByText("Augmented")).toBeInTheDocument();
    expect(screen.getByText("Automated")).toBeInTheDocument();
  });

  it("links to the landing's READ THE SCALE section", () => {
    render(
      <MemoryRouter>
        <ZoneLegend />
      </MemoryRouter>,
    );
    const link = screen.getByText("Learn to read the scale →");
    expect(link).toHaveAttribute("href", "/#read-the-scale");
  });

  it("shows short thresholds in mono", () => {
    render(
      <MemoryRouter>
        <ZoneLegend />
      </MemoryRouter>,
    );
    expect(screen.getByText("<0.40")).toBeInTheDocument();
    expect(screen.getByText("0.40–0.85")).toBeInTheDocument();
    expect(screen.getByText("≥0.85")).toBeInTheDocument();
  });
});
