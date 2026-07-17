/**
 * Audience-mode framings (GitHub #86) — the same data, three lenses.
 *
 *   · individual   — a worker: "what do I learn?"
 *   · organisation — a workforce leader: "where do I invest / redesign?"
 *   · education    — an educator: "how should the curriculum change?"
 *
 * ORTHOGONAL to language mode (#79): language governs the vocabulary REGISTER
 * (plain vs nautical); audience governs EMPHASIS, ordering, and who the copy
 * addresses. Audience copy is therefore written once, in a neutral register —
 * it reframes headings/ordering, and composes the zone/instrument words from
 * the active language lexicon rather than duplicating them. That keeps the two
 * axes from multiplying into a 2×3 copy matrix.
 *
 * The "same data, reframed" discipline (like the language lexicon): audience
 * mode only changes display strings and column ORDER — never the underlying
 * task/skill data.
 */

export type AudienceMode = "individual" | "organisation" | "education";

/** The three summary columns, keyed by role rather than display order so the
 * lexicon can reorder them per audience. */
export type SummaryColumn = "useNow" | "keepHuman" | "prepare";

export interface AudienceLexicon {
  /** Toggle label + one-line tooltip. */
  label: string;
  tagline: string;
  summary: {
    /** The panel eyebrow (was the fixed "WHAT THIS MEANS FOR YOU"). */
    eyebrow: string;
    /** Column headings, keyed by role. */
    columns: Record<SummaryColumn, string>;
    /** Render order of the three columns for this audience. */
    order: SummaryColumn[];
    /** The framing line under the columns (replaces the fixed evidence line). */
    framing: string;
  };
  skills: {
    title: string;
    intro: string;
  };
}

const individual: AudienceLexicon = {
  label: "Individual",
  tagline: "For a worker — what should I learn?",
  summary: {
    eyebrow: "WHAT THIS MEANS FOR YOU",
    columns: {
      useNow: "Use AI for, now",
      keepHuman: "Keep human control over",
      prepare: "Prepare for next",
    },
    order: ["useNow", "keepHuman", "prepare"],
    framing:
      "Use AI for and keep human control over reflect today's measured exposure; " +
      "prepare for next reflects rising usage across model eras — a direction, not a certainty.",
  },
  skills: {
    title: "Build these skills",
    intro:
      "Named capabilities to deepen — the work in this role that stays human-led, " +
      "and the skills that bridge to less-exposed roles.",
  },
};

const organisation: AudienceLexicon = {
  label: "Organisation",
  tagline: "For a workforce leader — where to invest and redesign?",
  summary: {
    eyebrow: "WHAT THIS MEANS FOR YOUR WORKFORCE",
    columns: {
      useNow: "Automate or augment now",
      keepHuman: "Keep human-led",
      prepare: "Plan reskilling for",
    },
    // Lead with the deployment lever, then the reskilling investment, then
    // what to protect — the order a workforce leader plans in.
    order: ["useNow", "prepare", "keepHuman"],
    framing:
      "Automate or augment and keep human-led reflect today's measured exposure; " +
      "plan reskilling for reflects rising usage across model eras — a planning signal, not a forecast.",
  },
  skills: {
    title: "Skills to invest in",
    intro:
      "Where reskilling pays — the durable capabilities to build in this role, " +
      "and the skills that open redeployment paths to less-exposed roles.",
  },
};

const education: AudienceLexicon = {
  label: "Education",
  tagline: "For an educator — how should the curriculum change?",
  summary: {
    eyebrow: "WHAT THIS MEANS FOR CURRICULUM",
    columns: {
      useNow: "Teach AI-collaboration for",
      keepHuman: "Keep teaching deeply",
      prepare: "Add to the curriculum",
    },
    // Lead with the durable human skills to keep teaching, then what's newly
    // in demand, then the AI-collaboration skills — the curriculum's spine first.
    order: ["keepHuman", "prepare", "useNow"],
    framing:
      "Keep teaching deeply and teach AI-collaboration for reflect today's measured exposure; " +
      "add to the curriculum reflects rising usage across model eras — an emerging demand, not a certainty.",
  },
  skills: {
    title: "Skills to teach",
    intro:
      "Curriculum signal — the durable capabilities worth teaching deeply in this role, " +
      "and the skills that open pathways to less-exposed roles.",
  },
};

export const AUDIENCE_LEXICONS: Record<AudienceMode, AudienceLexicon> = {
  individual,
  organisation,
  education,
};

export const DEFAULT_AUDIENCE: AudienceMode = "individual";
