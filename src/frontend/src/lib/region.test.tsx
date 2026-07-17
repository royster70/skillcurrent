import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useRegion } from "./region";

function Probe() {
  const { region, setRegion } = useRegion();
  const loc = useLocation();
  return (
    <div>
      <span data-testid="region">{region}</span>
      <span data-testid="search">{loc.search}</span>
      <button onClick={() => setRegion("AU")}>go-au</button>
      <button onClick={() => setRegion("US")}>go-us</button>
    </div>
  );
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("useRegion precedence (URL > localStorage > US)", () => {
  it("defaults to US with no URL param and no stored choice", () => {
    renderAt("/sectors");
    expect(screen.getByTestId("region").textContent).toBe("US");
  });

  it("falls back to the stored choice when the URL says nothing", () => {
    window.localStorage.setItem("sc.region", "AU");
    renderAt("/sectors");
    expect(screen.getByTestId("region").textContent).toBe("AU");
  });

  it("URL param wins over a conflicting stored choice", () => {
    window.localStorage.setItem("sc.region", "AU");
    renderAt("/sectors?region=US");
    expect(screen.getByTestId("region").textContent).toBe("US");
  });

  it("reading never writes the URL", () => {
    window.localStorage.setItem("sc.region", "AU");
    renderAt("/sectors?codes=51,54");
    expect(screen.getByTestId("region").textContent).toBe("AU");
    expect(screen.getByTestId("search").textContent).toBe("?codes=51,54");
  });

  it("setRegion persists and merges into existing URL params", () => {
    renderAt("/sectors/composite?codes=51,54");
    fireEvent.click(screen.getByText("go-au"));
    expect(window.localStorage.getItem("sc.region")).toBe("AU");
    const search = screen.getByTestId("search").textContent!;
    expect(search).toContain("codes=51");
    expect(search).toContain("region=AU");
  });

  it("selecting US removes the param (US is the unmarked default)", () => {
    renderAt("/sectors?region=AU");
    fireEvent.click(screen.getByText("go-us"));
    expect(screen.getByTestId("search").textContent).not.toContain("region=");
    expect(window.localStorage.getItem("sc.region")).toBe("US");
  });

  it("treats garbage in storage as unset", () => {
    window.localStorage.setItem("sc.region", "MOON");
    renderAt("/sectors");
    expect(screen.getByTestId("region").textContent).toBe("US");
  });
});
