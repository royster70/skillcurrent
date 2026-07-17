import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AudienceProvider } from "../lib/audience";
import { SectorBriefPage } from "./BriefPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  IS_STATIC: false,
  api: { sectorPriorities: vi.fn() },
}));

const SECTOR = {
  naics_code: "62",
  naics_title: "Health Care & Social Assistance",
  total_employment: 20_000_000,
  occupation_count: 40,
  priority_roles: [
    {
      soc_code: "29-1141.00",
      occupation_title: "Registered Nurses",
      headcount: 3_000_000,
      employment_share: 0.15,
      location_quotient: 1.2,
      eloundou_beta: 0.5,
      ms_ai_applicability: 0.3,
      aei_exposure: 0.2,
      dominant_zone: "E1",
      drift_velocity: 0.01,
      drift_classification: "departing",
      impact_score: 0.44,
      risk_factors: [],
    },
  ],
  full_mix: [],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(api.sectorPriorities).mockResolvedValue(SECTOR as never);
});

function renderSectorBrief(audience?: string) {
  if (audience) window.localStorage.setItem("sc.audienceMode", audience);
  return render(
    <MemoryRouter initialEntries={["/brief/sector/62"]}>
      <AudienceProvider>
        <Routes>
          <Route path="/brief/sector/:code" element={<SectorBriefPage />} />
        </Routes>
      </AudienceProvider>
    </MemoryRouter>,
  );
}

describe("SectorBriefPage", () => {
  it("renders a printable sector brief with the masthead, narrative and priority roles", async () => {
    renderSectorBrief();
    expect(await screen.findByText("Health Care & Social Assistance")).toBeInTheDocument();
    // Masthead states the audience lens + a print control
    expect(screen.getByText(/Prepared for/)).toBeInTheDocument();
    expect(screen.getByText("Individual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print \/ Save as PDF/ })).toBeInTheDocument();
    // Priority role from generateNarrative + the table
    await waitFor(() => expect(screen.getAllByText(/Registered Nurses/).length).toBeGreaterThan(0));
  });

  it("states the active audience lens on the masthead", async () => {
    renderSectorBrief("organisation");
    await screen.findByText("Health Care & Social Assistance");
    expect(screen.getByText("Organisation")).toBeInTheDocument();
  });

  it("passes the US region by default to the sector query", async () => {
    renderSectorBrief();
    await screen.findByText("Health Care & Social Assistance");
    expect(api.sectorPriorities).toHaveBeenCalledWith("62", 10, "US");
  });
});
