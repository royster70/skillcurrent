import { describe, it, expect } from "vitest";
import { LEXICONS, DEFAULT_MODE } from "./lexicon";
import { ZONE_LABELS, ZONE_TITLES, MOVEMENT_LABELS } from "./constants";

/** Walk both lexicons in parallel and assert structural parity: every leaf a
 * mode defines, the other defines too, with a non-empty value of the same
 * type. This is the guard that keeps the two vocabularies from drifting
 * apart as surfaces are added. */
function assertParity(a: unknown, b: unknown, path: string): void {
  expect(typeof b, path).toBe(typeof a);
  if (typeof a === "string") {
    expect((a as string).length, `${path} (plain) is empty`).toBeGreaterThan(0);
    expect((b as string).length, `${path} (nautical) is empty`).toBeGreaterThan(0);
    return;
  }
  if (typeof a === "function") return; // fmt helpers — checked behaviourally below
  if (a && typeof a === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    expect(kb, path).toEqual(ka);
    for (const k of ka) {
      assertParity(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
    }
  }
}

describe("lexicon", () => {
  it("plain is the default mode", () => {
    expect(DEFAULT_MODE).toBe("plain");
  });

  it("plain and nautical have identical shapes with non-empty strings", () => {
    assertParity(LEXICONS.plain, LEXICONS.nautical, "lexicon");
  });

  it("nautical wraps the constants.ts maps (no duplication drift)", () => {
    expect(LEXICONS.nautical.zoneLabels).toBe(ZONE_LABELS);
    expect(LEXICONS.nautical.zoneTitles).toBe(ZONE_TITLES);
    expect(LEXICONS.nautical.movementLabels).toBe(MOVEMENT_LABELS);
  });

  it("the three headline concepts are identical in both modes", () => {
    expect(LEXICONS.plain.headline).toEqual(LEXICONS.nautical.headline);
  });

  it("explainers are shared and deep-link to real methodology anchors", () => {
    expect(LEXICONS.plain.explainers).toEqual(LEXICONS.nautical.explainers);
    const anchors = ["#worked-example", "#the-formula", "#thresholds", "#observed-vs-theoretical", "#au-bridge", "#limitations"];
    for (const e of Object.values(LEXICONS.plain.explainers)) {
      expect(anchors).toContain(e.anchor);
    }
  });

  it("fmt helpers keep the β symbol out of plain mode", () => {
    expect(LEXICONS.plain.fmt.score(0.72)).not.toContain("β");
    expect(LEXICONS.nautical.fmt.score(0.72)).toContain("β");
    expect(LEXICONS.plain.fmt.driftTooltip(0.0123)).not.toContain("/era");
    expect(LEXICONS.nautical.fmt.driftTooltip(0.0123)).toContain("/era");
    // Both stay honest about missing data
    expect(LEXICONS.plain.fmt.driftTooltip(null).length).toBeGreaterThan(0);
    expect(LEXICONS.nautical.fmt.driftTooltip(null).length).toBeGreaterThan(0);
  });
});
