/**
 * Client-side composite-sector rollup for `cdn` mode.
 *
 * `/sectors/composite?codes=…` is the one endpoint that can't be pre-rendered
 * (any subset of ~20 codes is combinatorial). It's a pure GROUP BY over the
 * shipped `profiles.json`, so we reproduce composite_sector.py here. The AU
 * Census enrichments are the same additive GROUP BYs over three small tables.
 *
 * Parity with the backend is pinned by clientComposite.parity.test.ts.
 */

import { loadShared } from "./staticAdapter";
import type {
  CompositeOccupation,
  CompositeSectorResponse,
  OccupationMixEntry,
  SubdivisionEntry,
  SubdivisionOccupationProfile,
  SubdivisionOccupationRow,
} from "./api";

interface ProfileRow {
  naics_code: string;
  naics_title: string;
  onet_soc: string;
  occupation_title: string | null;
  region: string;
  headcount: number | null;
  eloundou_beta: number | null;
  ms_ai_applicability: number | null;
  aei_exposure: number | null;
  dominant_zone: string | null;
  drift_velocity: number | null;
  drift_classification: string | null;
}
interface WppRow { anzsic_division_code: string; anzsco_major_group: number | null; anzsco_major_group_name: string; employed_count: number | null }
interface SubRow { anzsic_division_code: string; subdivision_name: string; employment: number | null }
interface SubOccRow { indp_name: string; anzsic_division_code: string; anzsco_major_group: number; anzsco_major_group_name: string; employed_count: number | null }

function round(x: number | null | undefined, n: number): number | null {
  if (x == null) return null;
  const f = 10 ** n;
  return Math.round(x * f) / f;
}

/** Per-occupation employment-weighted score: Σ(hc·score) / Σ(hc) over rows with score present. */
function weighted(rows: ProfileRow[], key: "eloundou_beta" | "ms_ai_applicability" | "aei_exposure"): number | null {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const v = r[key];
    if (v != null) {
      const hc = r.headcount ?? 0;
      num += hc * v;
      den += hc;
    }
  }
  return den ? num / den : null;
}

function auOccupationMix(rows: WppRow[], codes: string[]): OccupationMixEntry[] | null {
  const sel = rows.filter((r) => codes.includes(r.anzsic_division_code) && r.anzsco_major_group != null);
  if (!sel.length) return null;
  const groups = new Map<string, { mg: number | null; name: string; count: number }>();
  for (const r of sel) {
    const gkey = `${r.anzsco_major_group}|${r.anzsco_major_group_name}`;
    const g = groups.get(gkey) ?? { mg: r.anzsco_major_group, name: r.anzsco_major_group_name, count: 0 };
    g.count += r.employed_count ?? 0;
    groups.set(gkey, g);
  }
  const entries = [...groups.values()].sort((a, b) => b.count - a.count);
  const total = entries.reduce((s, g) => s + g.count, 0);
  return entries.map((g) => ({
    anzsco_major_group: g.mg,
    major_group_name: g.name,
    employed_count: g.count,
    share_pct: total > 0 ? round((g.count / total) * 100, 1)! : 0,
  }));
}

function auSubdivisions(rows: SubRow[], codes: string[]): Record<string, SubdivisionEntry[]> | null {
  const sel = rows.filter((r) => codes.includes(r.anzsic_division_code) && r.employment != null);
  if (!sel.length) return null;
  const byDiv = new Map<string, SubRow[]>();
  for (const r of sel) (byDiv.get(r.anzsic_division_code) ?? byDiv.set(r.anzsic_division_code, []).get(r.anzsic_division_code)!).push(r);
  const out: Record<string, SubdivisionEntry[]> = {};
  for (const [div, subs] of byDiv) {
    const sorted = [...subs].sort((a, b) => (b.employment ?? 0) - (a.employment ?? 0));
    const total = sorted.reduce((s, x) => s + (x.employment ?? 0), 0);
    out[div] = sorted.slice(0, 8).map((x) => ({
      subdivision_name: x.subdivision_name,
      employment: x.employment,
      share_pct: total > 0 ? round(((x.employment ?? 0) / total) * 100, 1)! : 0,
    }));
  }
  return out;
}

function auSubdivisionOccMix(rows: SubOccRow[], codes: string[]): SubdivisionOccupationProfile[] | null {
  const sel = rows.filter((r) => codes.includes(r.anzsic_division_code));
  if (!sel.length) return null;
  const byIndp = new Map<string, SubOccRow[]>();
  for (const r of sel) (byIndp.get(r.indp_name) ?? byIndp.set(r.indp_name, []).get(r.indp_name)!).push(r);
  const profiles: SubdivisionOccupationProfile[] = [];
  for (const [indp, occ] of byIndp) {
    const total = occ.reduce((s, x) => s + (x.employed_count ?? 0), 0);
    if (total === 0) continue;
    const occupations: SubdivisionOccupationRow[] = occ
      .slice()
      .sort((a, b) => (b.employed_count ?? 0) - (a.employed_count ?? 0))
      .map((x) => ({
        anzsco_major_group: x.anzsco_major_group,
        major_group_name: x.anzsco_major_group_name,
        employed_count: x.employed_count ?? 0,
        share_pct: round(((x.employed_count ?? 0) / total) * 100, 1)!,
      }));
    profiles.push({ indp_name: indp, anzsic_division_code: occ[0].anzsic_division_code, total_employed: total, occupations });
  }
  profiles.sort((a, b) => b.total_employed - a.total_employed);
  return profiles.length ? profiles : null;
}

export async function compositeStatic(path: string): Promise<CompositeSectorResponse> {
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  const codes = (params.get("codes") ?? "").split(",").filter(Boolean);
  const region = (params.get("region") ?? "US").toUpperCase();
  const company = params.get("company");

  const profiles = await loadShared<ProfileRow[]>("profiles.json");
  const sel = profiles.filter((r) => r.region === region && codes.includes(r.naics_code));

  const found = new Map<string, string>();
  for (const r of sel) if (!found.has(r.naics_code)) found.set(r.naics_code, r.naics_title);

  // GROUP BY onet_soc
  const groups = new Map<string, ProfileRow[]>();
  for (const r of sel) (groups.get(r.onet_soc) ?? groups.set(r.onet_soc, []).get(r.onet_soc)!).push(r);

  const occupations: CompositeOccupation[] = [];
  let totalEmp = 0;
  let e0 = 0;
  let e1 = 0;
  let e2 = 0;
  let sumBeta = 0;
  let wBeta = 0;
  let sumMs = 0;
  let wMs = 0;
  let sumAei = 0;
  let wAei = 0;

  for (const [soc, rows] of groups) {
    const hc = rows.reduce((s, r) => s + (r.headcount ?? 0), 0);
    const byHc = [...rows].sort((a, b) => (b.headcount ?? 0) - (a.headcount ?? 0));
    const beta = round(weighted(rows, "eloundou_beta"), 4);
    const ms = round(weighted(rows, "ms_ai_applicability"), 4);
    const aei = round(weighted(rows, "aei_exposure"), 4);
    const zone = byHc[0].dominant_zone;
    const sectors = [...new Set(rows.map((r) => r.naics_title))].sort();
    const velocity = rows.reduce<number | null>((m, r) => (r.drift_velocity != null && (m == null || r.drift_velocity > m) ? r.drift_velocity : m), null);

    totalEmp += hc;
    if (zone === "E0") e0 += hc;
    else if (zone === "E1") e1 += hc;
    else if (zone === "E2") e2 += hc;
    if (beta != null) { sumBeta += hc * beta; wBeta += hc; }
    if (ms != null) { sumMs += hc * ms; wMs += hc; }
    if (aei != null) { sumAei += hc * aei; wAei += hc; }

    occupations.push({
      onet_soc: soc,
      occupation_title: byHc[0].occupation_title ?? soc,
      total_headcount: hc,
      sectors,
      eloundou_beta: beta,
      ms_ai_applicability: ms,
      aei_exposure: aei,
      dominant_zone: zone,
      drift_velocity: round(velocity, 6),
      drift_classification: byHc[0].drift_classification,
    });
  }
  occupations.sort((a, b) => b.total_headcount - a.total_headcount);

  const isAu = region === "AU";
  const [wpp, subs, subOcc] = isAu
    ? await Promise.all([
        loadShared<WppRow[]>("census_wpp.json"),
        loadShared<SubRow[]>("census_subdivisions.json"),
        loadShared<SubOccRow[]>("census_subdivision_occ.json"),
      ])
    : [null, null, null];

  return {
    codes,
    sector_names: codes.map((c) => found.get(c) ?? c),
    company_name: company,
    total_employment: totalEmp,
    occupation_count: occupations.length,
    weighted_eloundou_beta: wBeta ? round(sumBeta / wBeta, 4) : null,
    weighted_ms_applicability: wMs ? round(sumMs / wMs, 4) : null,
    weighted_aei_exposure: wAei ? round(sumAei / wAei, 4) : null,
    workers_e0: e0,
    workers_e1: e1,
    workers_e2: e2,
    occupation_mix: isAu ? auOccupationMix(wpp!, codes) : null,
    subdivisions: isAu ? auSubdivisions(subs!, codes) : null,
    subdivision_occupation_mix: isAu ? auSubdivisionOccMix(subOcc!, codes) : null,
    occupations,
  };
}
