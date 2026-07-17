/**
 * Two-lexicon vocabulary system (GitHub #79 — SOL review "vocabulary
 * discipline"). Ordinary surfaces speak THREE headline concepts — current AI
 * exposure, direction of change, recommended response — and everything else
 * (β, E0/E1/E2, drift velocity, the nautical instrument names) is either a
 * mode choice or lives behind an "Explain this score" disclosure.
 *
 *   · "plain"    — the DEFAULT. Simple terms lead; the metaphor is drill-down.
 *   · "nautical" — the original Waterline / Rising Tide / Bearings brand
 *                  language, kept fully working as the comparison arm of the
 *                  language trial (no analytics — the toggle IS the A/B).
 *
 * Rules:
 *   · Keys of zoneLabels / movementLabels are API contract values — NEVER
 *     translated, only their display strings differ.
 *   · constants.ts stays the nautical source of truth: this file WRAPS
 *     ZONE_LABELS / ZONE_TITLES / MOVEMENT_LABELS rather than duplicating
 *     them. Colours, thresholds and scales are mode-independent and stay in
 *     constants.ts.
 *   · explainers are IDENTICAL in both modes — they are the shared drill-down,
 *     each deep-linking to a MethodologyPage anchor.
 */

import { ZONE_LABELS, ZONE_TITLES, MOVEMENT_LABELS } from "./constants";

export type LanguageMode = "plain" | "nautical";

export type ZoneKey = "E0" | "E1" | "E2";
export type MovementKey =
  | "departing"
  | "enduring"
  | "emerging"
  | "below_threshold"
  | "unclassified";

export interface Explainer {
  title: string;
  body: string;
  /** MethodologyPage anchor, e.g. "#the-formula" — always deep-linkable. */
  anchor: string;
}

export interface Lexicon {
  /** Zone display names, keyed by the API's zone codes. */
  zoneLabels: Record<ZoneKey, string>;
  /** Hover qualifiers for bare zone chips. */
  zoneTitles: Record<ZoneKey, string>;
  /** Movement display names, keyed by the API's drift_classification values. */
  movementLabels: Record<MovementKey, string>;
  /** Named instruments/views. */
  instruments: {
    waterline: string;
    tide: string;
    bearings: string;
    highGround: string;
    taskChart: string;
  };
  /** Nav labels for the routes whose names are mode-dependent. */
  nav: { home: string; tide: string };
  /** The three headline concepts — identical in both modes by design. */
  headline: { exposure: string; direction: string; response: string };
  /** Lead sentences for the role-mix patterns (BearingsPanel/Summary). */
  leads: { hold: string; consolidate: string; toolUp: string };
  /** The zone-mix strip terms ("X% dry · Y% at the line · Z% under"). */
  mixTerms: { dry: string; line: string; under: string };
  /** ZoneExplorer tank strings. */
  tank: { top: string; bottom: string; drag: string; ariaSlider: string };
  /** Mode-aware numeric prose, so jargon symbols live in ONE place. */
  fmt: {
    /** "β 0.72" | "score 0.72" */
    score: (beta: number) => string;
    /** "β0.72" | "0.72" — tight chart captions */
    scoreShort: (beta: number) => string;
    /** "drier by 0.31" | "lower exposure by 0.31" */
    drierBy: (delta: number) => string;
    /** Tide-chip tooltip suffix; hides "/era" jargon in plain mode. */
    driftTooltip: (velocity: number | null) => string;
  };
  /** Shared drill-down content for ExplainDisclosure. */
  explainers: {
    beta: Explainer;
    zones: Explainer;
    drift: Explainer;
    coverage: Explainer;
  };
}

const sign = (v: number) => (v >= 0 ? "+" : "");

/** Identical in both modes — the drill-down layer, not a mode choice. */
const EXPLAINERS: Lexicon["explainers"] = {
  beta: {
    title: "The exposure score",
    body:
      "Each task gets one number: how much of it today's AI could help with or perform. " +
      "A role's score combines direct AI exposure with half-weighted tool-assisted exposure " +
      "(β = E1 + 0.5×E2, Eloundou 2024), so the scale runs 0 to 1.5.",
    anchor: "#the-formula",
  },
  zones: {
    title: "The three zones",
    body:
      "Scores group into three bands: mostly-human work, AI-assisted work, and highly " +
      "automatable work. The band edges (0.40 and 0.85) are configurable research " +
      "conventions, not laws of nature.",
    anchor: "#thresholds",
  },
  drift: {
    title: "Direction of change",
    body:
      "AI usage of each task is measured across successive model generations. A task is " +
      "rising when real usage keeps climbing generation over generation — a direction, " +
      "not a certainty.",
    anchor: "#observed-vs-theoretical",
  },
  coverage: {
    title: "Evidence coverage",
    body:
      "Up to three independent signals cover an occupation: predicted exposure from " +
      "research raters, and measured usage from Microsoft Copilot and Anthropic Claude. " +
      "The more signals present and agreeing, the firmer the reading.",
    anchor: "#observed-vs-theoretical",
  },
};

/** The three headline concepts — the entire user-facing model in both modes. */
const HEADLINE = {
  exposure: "Current AI exposure",
  direction: "Direction of change",
  response: "Recommended response",
} as const;

const plain: Lexicon = {
  zoneLabels: {
    E0: "Mostly human today",
    E1: "AI-assisted",
    E2: "Highly automatable",
  },
  zoneTitles: {
    E0: "Mostly human today: work today's AI barely reaches",
    E1: "AI-assisted: AI helps with routine parts while people lead",
    E2: "Highly automatable: AI can perform much of this task — whether it does depends on tools, controls and context",
  },
  movementLabels: {
    departing: "Growing AI use",
    enduring: "Steady",
    emerging: "Newly appearing",
    below_threshold: "Minimal use today",
    unclassified: "Not enough data",
  },
  instruments: {
    waterline: "AI exposure",
    tide: "AI usage trends",
    bearings: "What to do about it",
    highGround: "Durable skills",
    taskChart: "Tasks on the exposure scale",
  },
  nav: { home: "Overview", tide: "AI Trends" },
  headline: HEADLINE,
  leads: {
    hold:
      "Most of this role's work remains human-led today — the play is to deepen those " +
      "skills, and watch how AI usage changes.",
    consolidate:
      "A significant share of this role's tasks is already highly automatable. The role " +
      "consolidates around its human-led remainder — and those same skills open doors to " +
      "less-exposed roles.",
    toolUp:
      "Most of this role's tasks are AI-assisted — AI helps, people lead. Being the " +
      "person who wields the tools well is the near-term advantage.",
  },
  mixTerms: { dry: "human-led", line: "AI-assisted", under: "automatable" },
  tank: {
    top: "mostly human",
    bottom: "highly automatable",
    drag: "Drag the capability line",
    ariaSlider: "AI capability level",
  },
  fmt: {
    score: (beta) => `score ${beta.toFixed(2)}`,
    scoreShort: (beta) => beta.toFixed(2),
    drierBy: (delta) => `lower exposure by ${delta.toFixed(2)}`,
    driftTooltip: (v) =>
      v != null
        ? `average change ${sign(v)}${v.toFixed(3)} per model generation`
        : "no trend data",
  },
  explainers: EXPLAINERS,
};

const nautical: Lexicon = {
  zoneLabels: ZONE_LABELS,
  zoneTitles: ZONE_TITLES,
  movementLabels: MOVEMENT_LABELS,
  instruments: {
    waterline: "Waterline",
    tide: "Rising Tide",
    bearings: "Your bearings",
    highGround: "Your high ground",
    taskChart: "Task waterline",
  },
  nav: { home: "Waterline", tide: "Rising Tide" },
  headline: HEADLINE,
  leads: {
    hold:
      "Most of this role's weight already sits on dry ground — the play is to hold it: " +
      "deepen the human work below, and watch the tide for change.",
    consolidate:
      "A significant share of this role's weight is already submerged. The role " +
      "consolidates around its dry remainder — and the same dry skills open drier doors.",
    toolUp:
      "Most of this role's weight sits at the line — AI assists, human leads. Being the " +
      "person who wields the tools on those tasks is the near-term advantage.",
  },
  mixTerms: { dry: "dry", line: "at the line", under: "under" },
  tank: {
    top: "human-only · dry",
    bottom: "automation · submerged",
    drag: "Drag the waterline",
    ariaSlider: "Waterline",
  },
  fmt: {
    score: (beta) => `β ${beta.toFixed(2)}`,
    scoreShort: (beta) => `β${beta.toFixed(2)}`,
    drierBy: (delta) => `drier by ${delta.toFixed(2)}`,
    driftTooltip: (v) =>
      v != null ? `avg drift ${sign(v)}${v.toFixed(4)}/era` : "no velocity",
  },
  explainers: EXPLAINERS,
};

export const LEXICONS: Record<LanguageMode, Lexicon> = { plain, nautical };

export const DEFAULT_MODE: LanguageMode = "plain";
