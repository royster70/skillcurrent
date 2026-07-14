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

  it("offers every recognizable role to browse, but focuses one at a time", () => {
    renderExplorer();
    // all role names are reachable (focus title + the browse rail)
    expect(screen.getAllByText("Registered Nurse").length).toBeGreaterThan(0);
    expect(screen.getByText("Cashier")).toBeInTheDocument();
    expect(screen.getByText("Truck Driver")).toBeInTheDocument();
    // default focus = the first role, so only its tasks are shown…
    expect(screen.getByText(/Chart patient vitals/)).toBeInTheDocument();
    // …and another role's tasks stay hidden until you pick it
    expect(screen.queryByText(/Scan items and total/)).not.toBeInTheDocument();
  });

  it("switches focus when a role is picked from the browse rail", () => {
    renderExplorer();
    fireEvent.click(screen.getByText("Cashier"));
    expect(screen.getByText(/Scan items and total/)).toBeInTheDocument();
    // the previously focused role's tasks are no longer in view
    expect(screen.queryByText(/Chart patient vitals/)).not.toBeInTheDocument();
  });

  it("links the focused role to its live per-task page", () => {
    renderExplorer();
    // the focused role's title (an anchor) — the rail chips are buttons, not links
    const nurseLink = screen.getAllByText("Registered Nurse").find((el) => el.closest("a"));
    expect(nurseLink?.closest("a")).toHaveAttribute("href", "/occupations?selected=29-1141.00");
    // pick another role from the rail → it becomes the focused, linked role
    fireEvent.click(screen.getByText("Truck Driver"));
    const truckLink = screen.getAllByText("Truck Driver").find((el) => el.closest("a"));
    expect(truckLink?.closest("a")).toHaveAttribute("href", "/occupations?selected=53-3032.00");
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
