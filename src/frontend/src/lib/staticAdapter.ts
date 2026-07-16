/**
 * Static (no-backend) transport for `cdn` deployment mode.
 *
 * In `VITE_DEPLOYMENT_MODE=cdn`, api.ts routes every GET through `staticGet`
 * instead of `fetch('/api/...')`. Most endpoints are pre-rendered JSON files
 * (built by `scripts/build_static_site.py`); the two that can't be
 * pre-rendered — composite sectors (combinatorial) and text search (free-text)
 * — are computed client-side over shipped data artifacts.
 */

import { compositeStatic } from "./clientComposite";
import { textSearchStatic } from "./clientSearch";

/** Base URL for the static data tree, respecting Vite's `base` (Pages subpath). */
export function dataUrl(file: string): string {
  return `${import.meta.env.BASE_URL}data/${file}`;
}

/**
 * Map an API url path to its pre-rendered file. MUST stay in lock-step with
 * `_url_to_relpath` in scripts/build_static_site.py (a parity test pins them).
 *
 *   "/sectors?region=US"                       -> "sectors/region-US.json"
 *   "/sectors/62/priorities?top_n=10&region=US" -> "sectors/62/priorities/region-US/top_n-10.json"
 *   "/occupations/15-1252.00"                  -> "occupations/15-1252.00.json"
 */
export function pathToFile(path: string): string {
  const qIndex = path.indexOf("?");
  const base = qIndex === -1 ? path : path.slice(0, qIndex);
  const query = qIndex === -1 ? "" : path.slice(qIndex + 1);
  const segs = base.split("/").filter(Boolean);
  if (segs.length === 0) segs.push("index");
  if (query) {
    const pairs = query.split("&").map((kv) => {
      const i = kv.indexOf("=");
      return i === -1 ? [kv, ""] : [kv.slice(0, i), kv.slice(i + 1)];
    });
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    for (const [k, v] of pairs) segs.push(`${k}-${v}`);
  }
  return segs.join("/") + ".json";
}

/** Cached loader for the shared analytical artifacts (profiles, occ_index, ...). */
const cache = new Map<string, Promise<unknown>>();
export function loadShared<T>(file: string): Promise<T> {
  let p = cache.get(file);
  if (!p) {
    p = fetch(dataUrl(file)).then((r) => {
      if (!r.ok) throw new Error(`static data missing: ${file} (${r.status})`);
      return r.json();
    });
    cache.set(file, p);
  }
  return p as Promise<T>;
}

async function fetchFile<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file));
  if (!res.ok) throw new Error(`static data not found: ${file} (${res.status})`);
  return res.json() as Promise<T>;
}

/** GET transport for static mode. Composite + text search compute client-side. */
export async function staticGet<T>(path: string): Promise<T> {
  const base = path.split("?")[0];
  if (base === "/sectors/composite") return compositeStatic(path) as Promise<T>;
  if (base === "/search") return textSearchStatic(path) as Promise<T>;
  return fetchFile<T>(pathToFile(path));
}
