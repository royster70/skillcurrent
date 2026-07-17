/**
 * Client-side search for `cdn` mode.
 *
 * Replaces both /search (pg_trgm fuzzy) and /search/semantic (pgvector) with a
 * client-side trigram fuzzy match over the shipped `search_titles.json`, near
 * parity with the server's text search. Runtime query embedding (transformers.js
 * + a 25 MB model) is intentionally out of scope — instead, a *new* browse
 * feature, `similarOccupations`, uses the precomputed `neighbours.json`.
 */

import { loadShared } from "./staticAdapter";
import type { SearchResponse, SearchResult } from "./api";

type TitleRow = [string, string, number]; // [title, soc, 0=sample|1=alternate]
interface OccInfo {
  title: string;
  beta: number | null;
  ms: number | null;
  aei: number | null;
  zone: string | null;
  total_employment: number | null;
  has_tasks: boolean;
  category: string | null;
  /** Count of non-null core signals (0–3), from the regenerated occ_index
   * (#73). Optional: pre-regen artifacts lack it. */
  signals?: number;
}
type OccIndex = Record<string, OccInfo>;

/** pg_trgm-style trigrams: lowercase, split on non-alphanumeric, pad each word "  w ". */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)) {
    if (!w) continue;
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

async function runSearch(query: string, limit: number): Promise<SearchResponse> {
  const q = query.trim();
  if (q.length < 2) return { query: q, results: [], total: 0 };
  const [titles, occIndex] = await Promise.all([
    loadShared<TitleRow[]>("search_titles.json"),
    loadShared<OccIndex>("occ_index.json"),
  ]);

  const qLower = q.toLowerCase();
  const qTri = trigrams(q);
  // Best (score, matched_title, srcflag) per SOC — mirrors DISTINCT ON (soc) ORDER BY score DESC.
  const best = new Map<string, { score: number; title: string; flag: number }>();
  for (const [title, soc, flag] of titles) {
    let score: number;
    if (title.toLowerCase().includes(qLower)) {
      score = 1.0; // substring pass
    } else {
      const s = similarity(trigrams(title), qTri);
      if (s <= 0.2) continue; // trigram threshold (pg_trgm default is 0.3; search.py uses 0.2)
      score = s;
    }
    const cur = best.get(soc);
    if (!cur || score > cur.score) best.set(soc, { score, title, flag });
  }

  const results: SearchResult[] = [];
  for (const [soc, m] of best) {
    const info = occIndex[soc];
    if (!info) continue;
    results.push({
      matched_title: m.title,
      source: m.flag === 0 ? "sample" : "alternate",
      soc_code: soc,
      occupation_title: info.title,
      similarity: m.score >= 1 ? 1.0 : Math.round(m.score * 1000) / 1000,
      eloundou_beta: info.beta,
      ms_ai_applicability: info.ms,
      aei_exposure: info.aei,
      dominant_zone: info.zone,
      total_employment: info.total_employment,
      has_tasks: info.has_tasks,
      category: info.category,
    });
  }
  results.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0) || a.occupation_title.localeCompare(b.occupation_title));
  const top = results.slice(0, limit);
  return { query: q, results: top, total: top.length };
}

/** GET /search?q=… */
export async function textSearchStatic(path: string): Promise<SearchResponse> {
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  return runSearch(params.get("q") ?? "", Number(params.get("limit")) || 20);
}

/** POST /search/semantic — no runtime vectors in static mode; fuzzy over query + description. */
export async function semanticSearchStatic(query: string, description?: string, limit = 20): Promise<SearchResponse> {
  return runSearch([query, description].filter(Boolean).join(" "), limit);
}

export interface SimilarOccupation {
  soc_code: string;
  title: string;
  dominant_zone: string | null;
  eloundou_beta: number | null;
  score: number;
}

/** "Similar occupations" from the precomputed neighbours graph (a cdn-only browse feature). */
export async function similarOccupations(soc: string, limit = 6): Promise<SimilarOccupation[]> {
  const [neighbours, occIndex] = await Promise.all([
    loadShared<Record<string, [string, number][]>>("neighbours.json"),
    loadShared<OccIndex>("occ_index.json"),
  ]);
  const list = neighbours[soc] ?? [];
  const out: SimilarOccupation[] = [];
  for (const [nsoc, score] of list.slice(0, limit)) {
    const info = occIndex[nsoc];
    if (!info) continue;
    out.push({ soc_code: nsoc, title: info.title, dominant_zone: info.zone, eloundou_beta: info.beta, score });
  }
  return out;
}
