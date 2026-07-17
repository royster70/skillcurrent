import { describe, it, expect } from "vitest";
import { pathToFile } from "./staticAdapter";

// pathToFile MUST match _url_to_relpath in scripts/build_static_site.py exactly
// (these expectations are the paths the Python export writes; the live-vs-static
// parity gate depends on both sides agreeing).
describe("pathToFile", () => {
  it("maps global endpoints", () => {
    expect(pathToFile("/datasets")).toBe("datasets.json");
    expect(pathToFile("/occupations/hierarchy")).toBe("occupations/hierarchy.json");
  });

  it("maps a single query param", () => {
    expect(pathToFile("/sectors?region=US")).toBe("sectors/region-US.json");
  });

  it("sorts multi-param queries by key (order-independent)", () => {
    expect(pathToFile("/sectors/62/priorities?top_n=10&region=US")).toBe(
      "sectors/62/priorities/region-US/top_n-10.json",
    );
    expect(pathToFile("/sectors/62/priorities?region=US&top_n=10")).toBe(
      "sectors/62/priorities/region-US/top_n-10.json",
    );
    expect(pathToFile("/drift/departing?page=1&page_size=15")).toBe(
      "drift/departing/page-1/page_size-15.json",
    );
  });

  it("keeps SOC codes (hyphen + dot) intact in the path", () => {
    expect(pathToFile("/occupations/15-1252.00")).toBe("occupations/15-1252.00.json");
    expect(pathToFile("/occupations/15-1252.00/matrix")).toBe("occupations/15-1252.00/matrix.json");
  });

  it("maps the AU occupation surface (index + OSCA detail)", () => {
    // Pins the /au emitters added by the AU endpoint (GitHub #73/#78) to the
    // same generic algorithm on both sides.
    expect(pathToFile("/au/occupations")).toBe("au/occupations.json");
    expect(pathToFile("/au/occupations/261313")).toBe("au/occupations/261313.json");
  });
});
