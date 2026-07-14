import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ZoneExplorer, ZoneLegend } from "./ZoneExplorer";

function renderExplorer() {
  return render(
    <MemoryRouter>
      <ZoneExplorer />
    </MemoryRouter>,
  );
}

describe("ZoneExplorer", () => {
  it("shows correct zone labels", () => {
    renderExplorer();
    expect(screen.getByText("E0 — Insulated")).toBeInTheDocument();
    expect(screen.getByText("E1 — Augmented")).toBeInTheDocument();
    expect(screen.getByText("E2 — Automated")).toBeInTheDocument();
  });

  it("shows threshold ranges", () => {
    renderExplorer();
    expect(screen.getByText("Beta < 0.40")).toBeInTheDocument();
    expect(screen.getByText(/Beta 0\.40/)).toBeInTheDocument();
    expect(screen.getByText(/Beta ≥ 0\.85/)).toBeInTheDocument();
  });

  it("shows zone headlines", () => {
    renderExplorer();
    expect(screen.getByText("Human-only work")).toBeInTheDocument();
    expect(screen.getByText("AI assists, human leads")).toBeInTheDocument();
    expect(screen.getByText("AI performs, human validates")).toBeInTheDocument();
  });

  it("shows Beta formula text", () => {
    renderExplorer();
    expect(screen.getByText(/Beta = E1 \+ 0\.5×E2/)).toBeInTheDocument();
  });

  it("shows a worked example defaulting to Registered Nurse", () => {
    renderExplorer();
    // Role chip + its tasks render by default
    expect(screen.getByText(/Chart patient vitals/)).toBeInTheDocument();
    expect(screen.getByText(/Comfort and reassure patients/)).toBeInTheDocument();
    // Deep link to the real occupation page
    const link = screen.getByText(/full task breakdown/);
    expect(link).toHaveAttribute("href", "/occupations?selected=29-1141.00");
  });

  it("switches the worked example when another role is picked", () => {
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: "Bookkeeper" }));
    expect(screen.getByText(/Enter transactions into the ledger/)).toBeInTheDocument();
    // Nurse tasks gone
    expect(screen.queryByText(/Chart patient vitals/)).toBeNull();
    expect(screen.getByText(/full task breakdown/)).toHaveAttribute("href", "/occupations?selected=43-3031.00");
  });

  it("labels the worked example as representative, not live-computed", () => {
    renderExplorer();
    expect(screen.getByText(/Representative tasks, positioned by their AI exposure/)).toBeInTheDocument();
  });

  it("renders the gauge as an aria slider at the median", () => {
    renderExplorer();
    const slider = screen.getByRole("slider", { name: "Beta value" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.27");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "1.5");
  });

  it("jumps the gauge when a zone card is clicked", () => {
    renderExplorer();
    fireEvent.click(screen.getByText("E2 — Automated"));
    const slider = screen.getByRole("slider", { name: "Beta value" });
    expect(slider).toHaveAttribute("aria-valuenow", "1.05");
  });

  it("moves the gauge with arrow keys", () => {
    renderExplorer();
    const slider = screen.getByRole("slider", { name: "Beta value" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.32");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.27");
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
