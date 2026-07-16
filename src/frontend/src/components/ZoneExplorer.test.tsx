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
    expect(screen.getByText("E2 — High automation potential")).toBeInTheDocument();
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

  it("shows the Beta formula and the 0–1.5 scale gloss", () => {
    renderExplorer();
    // The footer both states the formula and explains the scale ceiling in
    // plain words (review item 1 — the 1.5 max is derived, not arbitrary).
    expect(screen.getByText(/β = E1 \+ 0\.5×E2/)).toBeInTheDocument();
    expect(screen.getByText(/tops out at 1\.5/)).toBeInTheDocument();
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

  it("renders the waterline as a vertical aria slider at the global today level", () => {
    renderExplorer();
    const slider = screen.getByRole("slider", { name: "Waterline" });
    expect(slider).toHaveAttribute("aria-orientation", "vertical");
    // one global "today's capability" waterline, same for every job
    expect(slider).toHaveAttribute("aria-valuenow", "0.65");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "1.5");
  });

  it("keeps the waterline fixed when browsing roles (same tide for every job)", () => {
    renderExplorer();
    const slider = screen.getByRole("slider", { name: "Waterline" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.65");
    fireEvent.click(screen.getByText("Bookkeeper"));
    expect(slider).toHaveAttribute("aria-valuenow", "0.65"); // unchanged
  });

  it("sets the waterline when a zone card is clicked", () => {
    renderExplorer();
    fireEvent.click(screen.getByText("E2 — High automation potential"));
    const slider = screen.getByRole("slider", { name: "Waterline" });
    expect(slider).toHaveAttribute("aria-valuenow", "1.05");
  });

  it("moves the waterline with up/down arrow keys", () => {
    renderExplorer();
    const slider = screen.getByRole("slider", { name: "Waterline" });
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.7");
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(slider).toHaveAttribute("aria-valuenow", "0.65");
  });

  it("reports the time-weighted share of the day below the waterline", () => {
    renderExplorer();
    // default focus = Registered Nurse (β 0.88@20%, 0.47@35%, 0.13@45%), global waterline 0.65
    // → only the 0.88 task is below → 20% of the day, 1 of 3 tasks (a human role reads LOW)
    expect(screen.getByText(/20% of the day below/)).toBeInTheDocument();
    expect(screen.getByText(/1\/3 tasks/)).toBeInTheDocument();
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
    expect(screen.getByText("High automation potential")).toBeInTheDocument();
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
