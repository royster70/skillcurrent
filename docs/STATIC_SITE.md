# Static site — the no-database build (P4)

SkillCurrent's Tier 1 is a read-only, precomputed, bounded corpus, so the whole
dashboard can run as a static site with **no backend and no database** — a
visitor loads it in a browser. It reaches near-full parity with the Docker/
self-host app; the only things it drops are the two features that genuinely
need a server (see below).

Live path in the README: **"static mirror"**. Deployed to GitHub Pages by
`.github/workflows/deploy-static.yml`.

## How it works

The frontend has one transport choke point — `src/frontend/src/lib/api.ts`
`get()`. A build-time flag switches it:

- **`VITE_DEPLOYMENT_MODE=full`** (default): GETs hit the FastAPI backend.
- **`VITE_DEPLOYMENT_MODE=cdn`**: GETs are served from a pre-rendered static
  data tree, and the two combinatorial/free-text endpoints compute client-side.

Nothing else in the app changes — pages, components, and types are identical
across both modes.

### The data tree

`scripts/build_static_site.py` pre-renders the API to JSON by **calling the
real FastAPI handlers** (imported, invoked with a DB session) over the bounded
key space — so every static file is byte-identical to the live API, with zero
SQL reimplementation. A parity gate (`scripts/verify_static_parity.py`) diffs a
sample of static files against a running backend and must report 0 differences.

| Artifact | What | How it's served |
|----------|------|-----------------|
| `data/**/*.json` | per-SOC detail+matrix, per-sector priorities, drift lists, GDPval, hierarchy, … | direct file fetch (`pathToFile` maps url→file) |
| `data/profiles.json` | the one cross-cutting table (9k rows) | client-side `GROUP BY` for composite sectors |
| `data/census_*.json` | 3 small AU census tables | client-side AU composite enrichments |
| `data/search_titles.json` + `occ_index.json` | 65k title→SOC corpus + per-SOC scores | client-side fuzzy search |
| `data/neighbours.json` | top-K similar occupations per SOC | "similar occupations" browse |

The data tree is a **build artifact** (gitignored) — generated at deploy time
from the committed seed. Only `src/backend/data/static/neighbours.json` is
committed (it needs the embeddings, which aren't in the seed, so it's
precomputed once by `scripts/build_occ_neighbours.py`).

### What's the same, what's different

**Full parity** (client-computed where needed): every sector/occupation/drift/
GDPval view, US + AU, composite sectors (any combination), the task matrix,
percentile context — the entire 6-page dashboard.

**Near-parity**: search is client-side trigram fuzzy matching over the same
65k titles the server searches (the server's semantic/vector mode collapses to
the same fuzzy path — no 25 MB model shipped). A **bonus** the server build
doesn't have: "similar occupations", from precomputed embedding neighbours.

**Dropped** (`full`-build-only): **CompanyLookup**. Its classify half needs a
paid Claude API key (can't ship a key), and its data (`asx_company_sectors`)
encodes proprietary GICS classifications (MSCI/S&P) that aren't redistributable
— it's registered `redistribution_ok=false` (`asx_gics`) and excluded from both
the seed and the static site. The full experience stays in the Docker/self-host
build, where the user fetches the ASX CSV and runs classify with their own key.

## Why not DuckDB-WASM?

The discovery doc (`ai_working/discoveries/static-smart-deployment.md`) proposed
DuckDB-WASM over Parquet for the analytical queries. The spike measured the
actual data: the cross-cutting table is **357 KB gzipped**, loads in **11 ms**,
and a composite rollup runs in **0.30 ms** in plain JS. DuckDB-WASM's multi-MB
WASM + cold start buys nothing at this scale — JSON/Arrow-in-JS won. Revisit
only if the dataset grows ~100×.

## Building it locally

```bash
# 1. backend with the seed (see docs/SEED_DATASET.md)
cd src/backend && python -m scripts.restore_seed
# 2. generate the data tree
python -m scripts.build_static_site
# 3. build + preview the static frontend
cd ../frontend
VITE_DEPLOYMENT_MODE=cdn npm run build
npm run preview          # browse with the backend stopped — it's fully static
```

## Related

- `.github/workflows/deploy-static.yml` — the Pages deploy pipeline
- `docs/SEED_DATASET.md` — the seed the data tree is built from
- `ai_working/discoveries/static-smart-deployment.md` — the substrate analysis + spike
