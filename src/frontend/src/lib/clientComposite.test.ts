import { describe, it, expect, vi } from "vitest";

// A small profiles fixture: "Manager" appears in both sectors (must de-dupe with
// summed headcount + employment-weighted scores); "Dev" only in Alpha.
const profiles = [
  { naics_code: "A", naics_title: "Alpha", onet_soc: "11-0000.00", occupation_title: "Manager", region: "US", headcount: 100, eloundou_beta: 0.5, ms_ai_applicability: 0.2, aei_exposure: 0.1, dominant_zone: "E1", drift_velocity: 0.01, drift_classification: "enduring" },
  { naics_code: "A", naics_title: "Alpha", onet_soc: "15-0000.00", occupation_title: "Dev", region: "US", headcount: 200, eloundou_beta: 0.9, ms_ai_applicability: 0.3, aei_exposure: 0.2, dominant_zone: "E2", drift_velocity: 0.02, drift_classification: "departing" },
  { naics_code: "B", naics_title: "Beta", onet_soc: "11-0000.00", occupation_title: "Manager", region: "US", headcount: 300, eloundou_beta: 0.6, ms_ai_applicability: 0.25, aei_exposure: 0.15, dominant_zone: "E1", drift_velocity: 0.03, drift_classification: "departing" },
];

vi.mock("./staticAdapter", () => ({
  loadShared: (file: string) => Promise.resolve(file === "profiles.json" ? profiles : []),
}));

import { compositeStatic } from "./clientComposite";

describe("compositeStatic", () => {
  it("de-dupes occupations across sectors with employment-weighted scores", async () => {
    const r = await compositeStatic("/sectors/composite?codes=A,B&region=US");

    expect(r.total_employment).toBe(600);
    expect(r.occupation_count).toBe(2);
    expect(r.sector_names).toEqual(["Alpha", "Beta"]);
    // sorted by total headcount desc
    expect(r.occupations.map((o) => o.onet_soc)).toEqual(["11-0000.00", "15-0000.00"]);

    const mgr = r.occupations[0];
    expect(mgr.total_headcount).toBe(400);
    // (100*0.5 + 300*0.6) / 400 = 0.575
    expect(mgr.eloundou_beta).toBeCloseTo(0.575, 4);
    // dominant zone + classification come from the largest-headcount row (sector B)
    expect(mgr.dominant_zone).toBe("E1");
    expect(mgr.drift_classification).toBe("departing");
    // max velocity across sectors
    expect(mgr.drift_velocity).toBeCloseTo(0.03, 6);
    expect(mgr.sectors).toEqual(["Alpha", "Beta"]);

    // workers by zone (whole occupation's headcount goes to its dominant zone)
    expect(r.workers_e0).toBe(0);
    expect(r.workers_e1).toBe(400);
    expect(r.workers_e2).toBe(200);

    // composite weighted beta = (400*0.575 + 200*0.9) / 600 = 0.6833
    expect(r.weighted_eloundou_beta).toBeCloseTo(0.6833, 4);
    // AU-only enrichments are null for US
    expect(r.occupation_mix).toBeNull();
    expect(r.subdivisions).toBeNull();
  });
});
