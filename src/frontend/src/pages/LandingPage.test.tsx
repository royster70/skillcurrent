import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { LandingPage } from "./LandingPage";

// LandingPage (via its own useApi(api.sectors) and the nested EraTide's
// useApi(api.waterline)) fetches on mount — stub both so the test never
// touches real `fetch`. Both callers land on the same mocked module.
vi.mock("../lib/api", () => ({
  api: {
    sectors: vi.fn(async () => ({ sectors: [] })),
    waterline: vi.fn(async () => ({
      total_eras: 0,
      total_benchmarks: 0,
      eras_in_order: [],
      by_benchmark: [],
      overall_velocity: null,
      source: "test",
    })),
  },
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}{loc.search}</div>;
}

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/search" element={<div>search page</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("LandingPage hero", () => {
  it("offers a role-search input directly in the hero, before any scrolling or narrative", () => {
    renderLanding();
    expect(screen.getByPlaceholderText(/Your job title/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Find my role/ })).toBeInTheDocument();
  });

  it("keeps the narrative reachable via a secondary CTA, not a required first step", () => {
    renderLanding();
    expect(screen.getByText("UNDERSTAND THE WATERLINE")).toBeInTheDocument();
  });

  it("does not navigate on a too-short query", () => {
    renderLanding();
    const input = screen.getByPlaceholderText(/Your job title/);
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("navigates to /search?q=<query> on submit", async () => {
    renderLanding();
    const input = screen.getByPlaceholderText(/Your job title/);
    fireEvent.change(input, { target: { value: "DevOps Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: /Find my role/ }));
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/search?q=DevOps%20Engineer");
    });
  });

  it("submits on Enter within the hero form", async () => {
    renderLanding();
    const input = screen.getByPlaceholderText(/Your job title/);
    fireEvent.change(input, { target: { value: "Nurse" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/search?q=Nurse");
    });
  });
});
