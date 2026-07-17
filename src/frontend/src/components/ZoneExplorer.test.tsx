import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ZoneExplorer, ZoneLegend } from "./ZoneExplorer";
import { LanguageProvider } from "../lib/language";
import { LEXICONS } from "../lib/lexicon";

const plainLex = LEXICONS.plain;
const nauticalLex = LEXICONS.nautical;

// Default render = plain mode (#79): no provider needed — the context default
// is a working plain lexicon. For nautical, seed localStorage and wrap in the
// provider (the same path the app takes).
function renderExplorer() {
  return render(
    <MemoryRouter>
      <ZoneExplorer />
    </MemoryRouter>,
  );
}

function renderExplorerNautical() {
  window.localStorage.setItem("sc.languageMode", "nautical");
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ZoneExplorer />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ZoneExplorer (plain mode — the default)", () => {
  it("shows plain zone labels without raw E-codes", () => {
    renderExplorer();
    expect(screen.getByText(plainLex.zoneLabels.E0)).toBeInTheDocument();
    expect(screen.getByText(plainLex.zoneLabels.E1)).toBeInTheDocument();
    expect(screen.getByText(plainLex.zoneLabels.E2)).toBeInTheDocument();
    expect(screen.queryByText(/E0 —/)).not.toBeInTheDocument();
  });

  it("hides β threshold ranges (they live behind the disclosure)", () => {
    renderExplorer();
    expect(screen.queryByText("Beta < 0.40")).not.toBeInTheDocument();
    expect(screen.queryByText(/β = E1/)).not.toBeInTheDocument();
    // …but the "Explain this score" disclosure is offered instead
    expect(screen.getByText("Explain this score")).toBeInTheDocument();
  });

  it("opens the explainer with the formula and a methodology deep link", () => {
    renderExplorer();
    fireEvent.click(screen.getByText("Explain this score"));
    expect(screen.getByText(plainLex.explainers.beta.title)).toBeInTheDocument();
    const link = screen.getByText("How it works →");
    expect(link.closest("a")).toHaveAttribute("href", "/methodology#the-formula");
  });

  it("shows zone headlines", () => {
    renderExplorer();
    expect(screen.getByText("Human-only work")).toBeInTheDocument();
    expect(screen.getByText("AI assists, human leads")).toBeInTheDocument();
    expect(screen.getByText("AI performs, human validates")).toBeInTheDocument();
  });

  it("offers every recognizable role to browse, but focuses one at a time", () => {
    renderExplorer();
    expect(screen.getAllByText("Registered Nurse").length).toBeGreaterThan(0);
    expect(screen.getByText("Cashier")).toBeInTheDocument();
    expect(screen.getByText("Truck Driver")).toBeInTheDocument();
    expect(screen.getByText(/Chart patient vitals/)).toBeInTheDocument();
    expect(screen.queryByText(/Scan items and total/)).not.toBeInTheDocument();
  });

  it("switches focus when a role is picked from the browse rail", () => {
    renderExplorer();
    fireEvent.click(screen.getByText("Cashier"));
    expect(screen.getByText(/Scan items and total/)).toBeInTheDocument();
    expect(screen.queryByText(/Chart patient vitals/)).not.toBeInTheDocument();
  });

  it("links the focused role to its live per-task page", () => {
    renderExplorer();
    const nurseLink = screen.getAllByText("Registered Nurse").find((el) => el.closest("a"));
    expect(nurseLink?.closest("a")).toHaveAttribute("href", "/occupations?selected=29-1141.00");
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
    const slider = screen.getByRole("slider", { name: plainLex.tank.ariaSlider });
    expect(slider).toHaveAttribute("aria-orientation", "vertical");
    expect(slider).toHaveAttribute("aria-valuenow", "0.65");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "1.5");
  });

  it("keeps the waterline fixed when browsing roles (same tide for every job)", () => {
    renderExplorer();
    const slider = screen.getByRole("slider", { name: plainLex.tank.ariaSlider });
    expect(slider).toHaveAttribute("aria-valuenow", "0.65");
    fireEvent.click(screen.getByText("Bookkeeper"));
    expect(slider).toHaveAttribute("aria-valuenow", "0.65"); // unchanged
  });

  it("sets the waterline when a zone card is clicked", () => {
    renderExplorer();
    fireEvent.click(screen.getByText(plainLex.zoneLabels.E2));
    const slider = screen.getByRole("slider", { name: plainLex.tank.ariaSlider });
    expect(slider).toHaveAttribute("aria-valuenow", "1.05");
  });

  it("moves the waterline with up/down arrow keys", () => {
    renderExplorer();
    const slider = screen.getByRole("slider", { name: plainLex.tank.ariaSlider });
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

describe("ZoneExplorer (nautical mode)", () => {
  it("shows E-coded zone labels with β threshold ranges", () => {
    renderExplorerNautical();
    expect(screen.getByText(`E0 — ${nauticalLex.zoneLabels.E0}`)).toBeInTheDocument();
    expect(screen.getByText(`E1 — ${nauticalLex.zoneLabels.E1}`)).toBeInTheDocument();
    expect(screen.getByText(`E2 — ${nauticalLex.zoneLabels.E2}`)).toBeInTheDocument();
    expect(screen.getByText("Beta < 0.40")).toBeInTheDocument();
    expect(screen.getByText(/Beta 0\.40/)).toBeInTheDocument();
    expect(screen.getByText(/Beta ≥ 0\.85/)).toBeInTheDocument();
  });

  it("shows the Beta formula and the 0–1.5 scale gloss in the footer", () => {
    renderExplorerNautical();
    expect(screen.getByText(/β = E1 \+ 0\.5×E2/)).toBeInTheDocument();
    expect(screen.getByText(/tops out at 1\.5/)).toBeInTheDocument();
  });

  it("names the slider Waterline", () => {
    renderExplorerNautical();
    expect(screen.getByRole("slider", { name: "Waterline" })).toBeInTheDocument();
  });
});

describe("ZoneLegend", () => {
  it("shows three zone pips with plain labels by default, no thresholds", () => {
    const { container } = render(
      <MemoryRouter>
        <ZoneLegend />
      </MemoryRouter>,
    );
    const pips = container.querySelectorAll('span[title^="E"]');
    expect(pips.length).toBe(3);
    expect(screen.getByText(plainLex.zoneLabels.E0)).toBeInTheDocument();
    expect(screen.getByText(plainLex.zoneLabels.E1)).toBeInTheDocument();
    expect(screen.getByText(plainLex.zoneLabels.E2)).toBeInTheDocument();
    expect(screen.queryByText("<0.40")).not.toBeInTheDocument();
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

  it("shows short thresholds in mono in nautical mode", () => {
    window.localStorage.setItem("sc.languageMode", "nautical");
    render(
      <MemoryRouter>
        <LanguageProvider>
          <ZoneLegend />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("<0.40")).toBeInTheDocument();
    expect(screen.getByText("0.40–0.85")).toBeInTheDocument();
    expect(screen.getByText("≥0.85")).toBeInTheDocument();
  });
});
