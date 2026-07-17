import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { LanguageProvider, useLanguage } from "./language";
import { LEXICONS } from "./lexicon";

/** Minimal consumer: shows the current mode's home nav label and a switch. */
function Probe() {
  const { mode, setMode, lex } = useLanguage();
  return (
    <div>
      <span data-testid="label">{lex.nav.home}</span>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => setMode(mode === "plain" ? "nautical" : "plain")}>switch</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("LanguageProvider", () => {
  it("defaults to plain mode", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("plain");
    expect(screen.getByTestId("label").textContent).toBe(LEXICONS.plain.nav.home);
  });

  it("toggles the lexicon and persists the choice", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByText("switch"));
    expect(screen.getByTestId("label").textContent).toBe(LEXICONS.nautical.nav.home);
    expect(window.localStorage.getItem("sc.languageMode")).toBe("nautical");
  });

  it("restores a persisted mode on mount", () => {
    window.localStorage.setItem("sc.languageMode", "nautical");
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("nautical");
  });

  it("ignores garbage in storage and falls back to plain", () => {
    window.localStorage.setItem("sc.languageMode", "pirate");
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("plain");
  });

  it("provides a working plain lexicon without a provider (test/default context)", () => {
    render(<Probe />);
    expect(screen.getByTestId("mode").textContent).toBe("plain");
    expect(screen.getByTestId("label").textContent).toBe(LEXICONS.plain.nav.home);
  });
});
