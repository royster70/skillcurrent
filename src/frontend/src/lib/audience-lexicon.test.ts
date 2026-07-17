import { describe, it, expect } from "vitest";
import { AUDIENCE_LEXICONS, DEFAULT_AUDIENCE, type SummaryColumn } from "./audience-lexicon";

const MODES = ["individual", "organisation", "education"] as const;
const COLUMNS: SummaryColumn[] = ["useNow", "keepHuman", "prepare"];

describe("audience-lexicon", () => {
  it("individual is the default", () => {
    expect(DEFAULT_AUDIENCE).toBe("individual");
  });

  it("every audience defines all three summary columns and orders exactly those three", () => {
    for (const m of MODES) {
      const s = AUDIENCE_LEXICONS[m].summary;
      expect(Object.keys(s.columns).sort()).toEqual([...COLUMNS].sort());
      // order is a permutation of the three columns — no drops, no dupes
      expect([...s.order].sort()).toEqual([...COLUMNS].sort());
      expect(new Set(s.order).size).toBe(3);
    }
  });

  it("every string field is non-empty across all audiences", () => {
    for (const m of MODES) {
      const a = AUDIENCE_LEXICONS[m];
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.tagline.length).toBeGreaterThan(0);
      expect(a.summary.eyebrow.length).toBeGreaterThan(0);
      expect(a.summary.framing.length).toBeGreaterThan(0);
      expect(a.skills.title.length).toBeGreaterThan(0);
      expect(a.skills.intro.length).toBeGreaterThan(0);
      for (const c of COLUMNS) expect(a.summary.columns[c].length).toBeGreaterThan(0);
    }
  });

  it("audiences genuinely differ — the three lead with different columns", () => {
    const firsts = MODES.map((m) => AUDIENCE_LEXICONS[m].summary.order[0]);
    // Education leads with the durable skills, Organisation with the deploy
    // lever, Individual with the personal reading — not all identical.
    expect(new Set(firsts).size).toBeGreaterThan(1);
    expect(AUDIENCE_LEXICONS.education.summary.order[0]).toBe("keepHuman");
    expect(AUDIENCE_LEXICONS.organisation.summary.order[0]).toBe("useNow");
  });

  it("skills titles are distinct per audience (build / invest / teach)", () => {
    const titles = MODES.map((m) => AUDIENCE_LEXICONS[m].skills.title);
    expect(new Set(titles).size).toBe(3);
  });
});
