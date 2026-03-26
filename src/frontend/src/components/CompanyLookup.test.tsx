import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompanyLookup } from "./CompanyLookup";
import { api } from "../lib/api";

// Mock the api module
vi.mock("../lib/api", () => ({
  api: {
    companySearch: vi.fn(),
    companyClassify: vi.fn(),
  },
}));

// Mock useNavigate (CompanyLookup doesn't use it, but React Router context may be needed)
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

const mockSearchResults = {
  results: [
    {
      company_name: "TELSTRA GROUP LIMITED",
      asx_code: "TLS",
      sector_codes: ["J"],
      sector_names: ["Information Media and Telecommunications"],
      source: "asx",
      confidence: 0.95,
    },
    {
      company_name: "TELSTRA HEALTH LIMITED",
      asx_code: null,
      sector_codes: ["Q", "J"],
      sector_names: ["Health Care and Social Assistance", "Information Media and Telecommunications"],
      source: "cached",
      confidence: 0.85,
    },
  ],
  query: "telstra",
  region: "AU",
};

const mockClassifyResult = {
  company_name: "Jemena",
  sectors: [
    { code: "D", name: "Electricity, Gas, Water and Waste Services", confidence: 0.92 },
    { code: "E", name: "Construction", confidence: 0.71 },
  ],
  sector_codes: ["D", "E"],
  source: "llm",
  region: "AU",
};

describe("CompanyLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.companySearch).mockResolvedValue(mockSearchResults);
    vi.mocked(api.companyClassify).mockResolvedValue(mockClassifyResult);
  });

  it("renders header text", () => {
    render(<CompanyLookup region="AU" onSectorsSelected={() => {}} />);
    expect(screen.getByText("Look up a company")).toBeInTheDocument();
  });

  it("shows AU hint text", () => {
    render(<CompanyLookup region="AU" onSectorsSelected={() => {}} />);
    expect(screen.getByText(/Search ASX listings/)).toBeInTheDocument();
  });

  it("shows US hint text for US region", () => {
    render(<CompanyLookup region="US" onSectorsSelected={() => {}} />);
    expect(screen.getByText(/Classify with AI/)).toBeInTheDocument();
  });

  it("content hidden when collapsed", () => {
    render(<CompanyLookup region="AU" onSectorsSelected={() => {}} />);
    expect(screen.queryByPlaceholderText(/Type company name/)).not.toBeInTheDocument();
  });

  it("content visible when expanded", () => {
    render(<CompanyLookup region="AU" onSectorsSelected={() => {}} />);
    fireEvent.click(screen.getByText("Look up a company"));
    expect(screen.getByPlaceholderText(/Type company name/)).toBeInTheDocument();
  });

  it("shows search results after typing", async () => {
    render(<CompanyLookup region="AU" onSectorsSelected={() => {}} />);
    fireEvent.click(screen.getByText("Look up a company"));

    const input = screen.getByPlaceholderText(/Type company name/);
    fireEvent.change(input, { target: { value: "telstra" } });

    await waitFor(() => {
      expect(screen.getByText("TELSTRA GROUP LIMITED")).toBeInTheDocument();
    });
  });

  it("shows ASX code badge for listed companies", async () => {
    render(<CompanyLookup region="AU" onSectorsSelected={() => {}} />);
    fireEvent.click(screen.getByText("Look up a company"));

    fireEvent.change(screen.getByPlaceholderText(/Type company name/), {
      target: { value: "telstra" },
    });

    await waitFor(() => {
      expect(screen.getByText("TLS")).toBeInTheDocument();
    });
  });

  it("calls onSectorsSelected when result clicked", async () => {
    const onSelect = vi.fn();
    render(<CompanyLookup region="AU" onSectorsSelected={onSelect} />);
    fireEvent.click(screen.getByText("Look up a company"));

    fireEvent.change(screen.getByPlaceholderText(/Type company name/), {
      target: { value: "telstra" },
    });

    await waitFor(() => {
      expect(screen.getByText("TELSTRA GROUP LIMITED")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("TELSTRA GROUP LIMITED"));
    expect(onSelect).toHaveBeenCalledWith(["J"]);
  });

  it("shows AI classification result", async () => {
    // Return empty search so classify button appears
    vi.mocked(api.companySearch).mockResolvedValue({
      results: [],
      query: "jemena",
      region: "AU",
    });

    render(<CompanyLookup region="AU" onSectorsSelected={() => {}} />);
    fireEvent.click(screen.getByText("Look up a company"));

    fireEvent.change(screen.getByPlaceholderText(/Type company name/), {
      target: { value: "jemena" },
    });

    // Wait for empty results, then click classify
    await waitFor(() => {
      expect(screen.getByText("Classify with AI")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Classify with AI"));

    await waitFor(() => {
      expect(screen.getByText("AI Classification")).toBeInTheDocument();
      expect(screen.getByText(/Electricity, Gas/)).toBeInTheDocument();
    });
  });

  it("Use these sectors button calls onSectorsSelected", async () => {
    vi.mocked(api.companySearch).mockResolvedValue({
      results: [],
      query: "jemena",
      region: "AU",
    });

    const onSelect = vi.fn();
    render(<CompanyLookup region="AU" onSectorsSelected={onSelect} />);
    fireEvent.click(screen.getByText("Look up a company"));

    fireEvent.change(screen.getByPlaceholderText(/Type company name/), {
      target: { value: "jemena" },
    });

    await waitFor(() => {
      expect(screen.getByText("Classify with AI")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Classify with AI"));

    await waitFor(() => {
      expect(screen.getByText("Use these sectors")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Use these sectors"));
    expect(onSelect).toHaveBeenCalledWith(["D", "E"]);
  });

  it("dismiss button clears classification", async () => {
    vi.mocked(api.companySearch).mockResolvedValue({
      results: [],
      query: "jemena",
      region: "AU",
    });

    render(<CompanyLookup region="AU" onSectorsSelected={() => {}} />);
    fireEvent.click(screen.getByText("Look up a company"));

    fireEvent.change(screen.getByPlaceholderText(/Type company name/), {
      target: { value: "jemena" },
    });

    await waitFor(() => {
      expect(screen.getByText("Classify with AI")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Classify with AI"));

    await waitFor(() => {
      expect(screen.getByText("Dismiss")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Dismiss"));

    expect(screen.queryByText("AI Classification")).not.toBeInTheDocument();
  });
});
