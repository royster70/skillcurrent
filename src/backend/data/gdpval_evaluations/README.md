# GDPval evaluations — durable, committed capability dataset

This directory is the **source of truth** for GDPval model-era capability
evaluations (`gdpval_evaluations` table). It exists because this data is:

- **Expensive** — each model era costs a paid Anthropic API run (~$7.85/era:
  target model + Haiku judge over 220 tasks × ~10k rubric items).
- **Irreplaceable-if-lost** — it was lost once (a laptop rebuild wiped the DB
  and no dump existed, because the paid output was written *only* to the DB).
- **Load-bearing** — it is the platform's only *redistributable* task-level
  AI-**capability** signal over model generations (Elo leaderboards like
  GDPval-AA are not redistributable; see the design brief §8). Everything else
  is usage or one-shot theoretical exposure.

So the paid computation now writes here **first** (a committed CSV), and the DB
is populated *from* these files by `scripts/ingest_gdpval_evaluations.py`. A
rebuild re-runs the free ingest, never the paid eval. **Commit these files.**

## File format

One CSV per model era, named `<model_era>.csv` (e.g. `claude-4-sonnet.csv`).
Files whose name starts with `_` (e.g. `_TEMPLATE.csv`) are docs and are
**skipped** by the ingest.

Columns (header row required, exact names, one row per GDPval task):

| column | type | notes |
|---|---|---|
| `task_id` | text | must exist in `gdpval_tasks` (FK); rows with unknown ids are skipped with a warning |
| `model_era` | text | canonical era key, e.g. `claude-4-sonnet` — must match the filename |
| `model_name` | text | exact API model id evaluated, e.g. `claude-sonnet-4-20250514` |
| `evaluation_date` | date | `YYYY-MM-DD`, when the eval ran |
| `total_score` | float | rubric points the model's deliverable earned |
| `max_possible_score` | float | rubric points available for the task |
| `completion_pct` | float | `total_score / max_possible_score`, 0–1 |
| `notes` | text | method caveat, e.g. `text-evaluation proxy (not computer-use)` |

## Adding a new model over time (the extendable part)

1. Run the paid eval for the new era, e.g.:
   `python -m scripts.compute_gdpval_waterline --eras claude-5-sonnet`
   It writes `claude-5-sonnet.csv` here (and to the DB) on completion.
2. **Commit the new `.csv`** — that is the durable backup.
3. Re-run the ingest (free): `python -m scripts.ingest_gdpval_evaluations`.
   The glob picks up the new file automatically; existing eras are untouched.

The canonical waterline holds **one tier (Sonnet) constant across generations**
so the signal isolates temporal shift (see CLAUDE.md FR-8.7 P0b). Extend the
line each new Sonnet generation; the Epoch ECI benchmark series carries the
long-run *length*, GDPval carries the occupation-grounded *anchor points*.

### Cross-lab is supported (this format is vendor-agnostic)

`model_era` makes no assumption about vendor, so **OpenAI (or any lab's) models
are additional eras**, not a special case — drop in `gpt-5.4.csv` etc. and the
ingest treats them identically. Notes on doing this honestly:

- The GDPval **gold task set is MIT** (`openai/gdpval` on HuggingFace) and the
  tasks are the same 44 O*NET-mapped occupations — so cross-lab scores are
  directly comparable and publishable.
- **You do not need OpenAI's leaderboard data** (it is likely view-only): the
  MIT tasks + OpenAI's *public* automated grader (`evals.openai.com`, open to
  external researchers) let you generate your own scores. Every input is open or
  yours.
- **Hold the judge/grader constant across all eras and labs** — it is the
  measuring instrument. Either keep the local Haiku judge for everything, or use
  OpenAI's public grader for everything; do not mix graders within one waterline.
- A third-party `lshx90/gdpval-gpt5` HF dataset of GPT-5 results exists but is
  unofficial and licence-unknown — verify its licence before ingesting it here.

## Provenance

The ingest registers a `dataset_versions` row (`dataset_name =
'gdpval_evaluations'`, `version_key` = the sorted era set, `integrity_hash` =
SHA-256 of the CSVs) per ADR-002, so the freshness/vintage stamp has a real
source date. The judge model is held constant (Haiku 4.5) across eras — it is
the measuring instrument; only the subject model varies.
