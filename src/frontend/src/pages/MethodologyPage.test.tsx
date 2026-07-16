import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MethodologyPage } from "./MethodologyPage";
import { ZONE_THRESHOLDS, BETA_SCALE } from "../lib/constants";

function renderPage() {
  return render(
    <MemoryRouter>
      <MethodologyPage />
    </MemoryRouter>,
  );
}

describe("MethodologyPage", () => {
  it("is no longer the stub — the deferred-phase promise is gone", () => {
    renderPage();
    expect(screen.queryByText(/arrives in a later phase/)).not.toBeInTheDocument();
  });

  it("walks a real worked occupation through to a time-weighted role reading", () => {
    renderPage();
    expect(screen.getByText("Chart patient vitals and update records")).toBeInTheDocument();
    expect(screen.getByText("Role reading — time-weighted, not eyeballed")).toBeInTheDocument();
    // 0.88*0.20 + 0.47*0.35 + 0.13*0.45 = 0.399 -> renders as 0.399, reads E0 (just under 0.40)
    expect(screen.getByText("β 0.399")).toBeInTheDocument();
  });

  it("states the actual zone threshold values, not hand-typed numbers that could drift", () => {
    renderPage();
    expect(
      screen.getByText(new RegExp(`Why ${ZONE_THRESHOLDS.E1.toFixed(2)} and ${ZONE_THRESHOLDS.E2.toFixed(2)}`)),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`0 to ${BETA_SCALE.max} rather`))).toBeInTheDocument();
  });

  it("names all three evidence sources and the AU semantic bridge", () => {
    renderPage();
    expect(screen.getByText(/Eloundou 2024 — theoretical/)).toBeInTheDocument();
    expect(screen.getByText(/Microsoft "Working with AI" — empirical/)).toBeInTheDocument();
    expect(screen.getByText(/Anthropic Economic Index \(AEI\) — empirical/)).toBeInTheDocument();
    expect(screen.getByText(/1,923 of 1,925/)).toBeInTheDocument();
  });

  it("states non-claims explicitly, including that this isn't career or financial advice", () => {
    renderPage();
    expect(screen.getByText(/not career, legal, or financial advice/)).toBeInTheDocument();
    expect(screen.getByText(/universal physical constants/)).toBeInTheDocument();
  });

  it("links out to the live source registry instead of restating vintages", () => {
    renderPage();
    const link = screen.getByText("See the data behind it →");
    expect(link.closest("a")).toHaveAttribute("href", "/sources");
  });
});
