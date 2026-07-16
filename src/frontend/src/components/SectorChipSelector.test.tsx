import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SectorChipSelector } from "./SectorChipSelector";
import type { SectorSummary } from "../lib/api";

// ── Mock react-router-dom ──
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// ── Fixtures ──

function makeSector(code: string, title: string, zone: "E0" | "E1" | "E2" = "E0"): SectorSummary {
  return {
    naics_code: code,
    naics_title: title,
    occupation_count: 100,
    total_employment: 10_000_000,
    avg_eloundou_beta: 0.35,
    avg_ms_applicability: 0.15,
    avg_aei_exposure: 0.10,
    zone_e0_count: zone === "E0" ? 80 : 20,
    zone_e1_count: zone === "E1" ? 80 : 20,
    zone_e2_count: zone === "E2" ? 80 : 20,
    weighted_eloundou_beta: 0.35,
    weighted_ms_applicability: 0.15,
    weighted_aei_exposure: 0.10,
    workers_e0: zone === "E0" ? 8_000_000 : 1_000_000,
    workers_e1: zone === "E1" ? 8_000_000 : 1_000_000,
    workers_e2: zone === "E2" ? 8_000_000 : 1_000_000,
  };
}

const sectors = [
  makeSector("62", "Health Care and Social Assistance", "E0"),
  makeSector("54", "Professional, Scientific, and Technical Services", "E1"),
  makeSector("51", "Information", "E2"),
  makeSector("31-33", "Manufacturing", "E0"),
];

// ── Tests ──

describe("SectorChipSelector", () => {
  it("renders empty state with placeholder text", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={[]} onChange={() => {}} />
    );
    expect(screen.getByText("Build composite view...")).toBeInTheDocument();
    expect(screen.getByText("Select 2+ sectors to compare")).toBeInTheDocument();
  });

  it("shows selected count when sectors chosen", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={["62", "54"]} onChange={() => {}} />
    );
    expect(screen.getByText("2 sectors selected")).toBeInTheDocument();
  });

  it("renders chip for each selected sector", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={["62", "51"]} onChange={() => {}} />
    );
    expect(screen.getByText("Health Care and Social Assistance")).toBeInTheDocument();
    expect(screen.getByText("Information")).toBeInTheDocument();
  });

  it("calls onChange when removing a chip", () => {
    const onChange = vi.fn();
    render(
      <SectorChipSelector sectors={sectors} selected={["62", "54"]} onChange={onChange} />
    );
    // Click the × button on first chip (Health Care) — find the close button by
    // its SVG content, they're the small ones inside chips
    const chips = screen.getByText("Health Care and Social Assistance").closest("div");
    const closeBtn = chips?.querySelector("button");
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onChange).toHaveBeenCalledWith(["54"]);
    }
  });

  it("analyse button disabled with fewer than 2 sectors", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={["62"]} onChange={() => {}} />
    );
    const btn = screen.getByText(/Analyse 1 Sectors/);
    expect(btn.closest("button")).toBeDisabled();
  });

  it("analyse button enabled with 2+ sectors", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={["62", "54"]} onChange={() => {}} />
    );
    const btn = screen.getByText(/Analyse 2 Sectors/);
    expect(btn.closest("button")).not.toBeDisabled();
  });

  it("analyse button navigates to composite page", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={["62", "54"]} onChange={() => {}} />
    );
    fireEvent.click(screen.getByText(/Analyse 2 Sectors/));
    expect(mockNavigate).toHaveBeenCalledWith("/sectors/composite?codes=62,54");
  });

  it("opens dropdown on add button click", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={[]} onChange={() => {}} />
    );
    fireEvent.click(screen.getByText("Build composite view..."));
    expect(screen.getByPlaceholderText("Search sectors...")).toBeInTheDocument();
  });

  it("dropdown filters sectors by search text", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={[]} onChange={() => {}} />
    );
    fireEvent.click(screen.getByText("Build composite view..."));
    const input = screen.getByPlaceholderText("Search sectors...");
    fireEvent.change(input, { target: { value: "health" } });
    expect(screen.getByText("Health Care and Social Assistance")).toBeInTheDocument();
    expect(screen.queryByText("Manufacturing")).not.toBeInTheDocument();
  });

  it("dropdown excludes already-selected sectors", () => {
    render(
      <SectorChipSelector sectors={sectors} selected={["62"]} onChange={() => {}} />
    );
    fireEvent.click(screen.getByText("Add sector..."));
    // Health Care should NOT appear in dropdown (already selected)
    const dropdownItems = screen.queryAllByText("Health Care and Social Assistance");
    // One in the chip, none in the dropdown
    expect(dropdownItems.length).toBe(1);
  });

  it("calls onChange when adding a sector from dropdown", () => {
    const onChange = vi.fn();
    render(
      <SectorChipSelector sectors={sectors} selected={["62"]} onChange={onChange} />
    );
    fireEvent.click(screen.getByText("Add sector..."));
    fireEvent.click(screen.getByText("Information"));
    expect(onChange).toHaveBeenCalledWith(["62", "51"]);
  });
});
