import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { AudienceProvider, useAudience } from "./audience";
import { AUDIENCE_LEXICONS } from "./audience-lexicon";

function Probe() {
  const { mode, setMode, aud } = useAudience();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="eyebrow">{aud.summary.eyebrow}</span>
      <button onClick={() => setMode("organisation")}>org</button>
      <button onClick={() => setMode("education")}>edu</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("AudienceProvider", () => {
  it("defaults to individual", () => {
    render(
      <AudienceProvider>
        <Probe />
      </AudienceProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("individual");
    expect(screen.getByTestId("eyebrow").textContent).toBe(AUDIENCE_LEXICONS.individual.summary.eyebrow);
  });

  it("switches lens and persists the choice", () => {
    render(
      <AudienceProvider>
        <Probe />
      </AudienceProvider>,
    );
    fireEvent.click(screen.getByText("org"));
    expect(screen.getByTestId("mode").textContent).toBe("organisation");
    expect(screen.getByTestId("eyebrow").textContent).toBe(AUDIENCE_LEXICONS.organisation.summary.eyebrow);
    expect(window.localStorage.getItem("sc.audienceMode")).toBe("organisation");
  });

  it("restores a persisted mode on mount", () => {
    window.localStorage.setItem("sc.audienceMode", "education");
    render(
      <AudienceProvider>
        <Probe />
      </AudienceProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("education");
  });

  it("ignores garbage in storage and falls back to individual", () => {
    window.localStorage.setItem("sc.audienceMode", "martian");
    render(
      <AudienceProvider>
        <Probe />
      </AudienceProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("individual");
  });

  it("provides a working individual lexicon without a provider (default context)", () => {
    render(<Probe />);
    expect(screen.getByTestId("mode").textContent).toBe("individual");
  });
});
