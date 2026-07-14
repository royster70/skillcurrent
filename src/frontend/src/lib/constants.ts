/** SkillCurrent design tokens — the "Warm Instrument" system.
 *
 * Replaces the legacy Pencil / orange palette. Zone hues are REASSIGNED per the
 * brand brief (src/frontend/design/skillcurrent-brand-brief.md §7) — do NOT mix
 * old and new. Light is the default; dark is first-class.
 *
 * Panel palettes (GDPVAL_COLORS / AEI_COLORS) and CLASSIFICATION_COLORS are kept
 * as-is for now; each is re-skinned when its panel/page is redesigned (§10).
 */

// ── Theme surfaces (light + dark). Brass is the single instrument accent. ──
export const THEME = {
  light: {
    ground: "#f2f6f5",
    surface: "#ffffff",
    ink: "#0e1f27",
    inkMuted: "#46565c",
    brass: "#9c6414",
    // The instrument reads the current: brass is the fixed tool (wordmark text,
    // buttons, active states); `current` is the water/wind hue reserved for
    // anything that MOVES (streamlines, the waterline underline, hover flows).
    // Deliberately distinct from the E1/E2 zone hues below — motion, not data.
    current: "#3f8aa1",
    line: "#d9e2e0",
  },
  dark: {
    ground: "#071019",
    surface: "#0f1e29",
    ink: "#e7f1ef",
    inkMuted: "#9fb0b5",
    brass: "#e3a344",
    current: "#6cb8cc",
    line: "#1e3340",
  },
} as const;

// Brass at low alpha — the shared "selected/active" tint (nav, toggles, chips).
export const BRASS_TINT = "rgba(156, 100, 20, 0.10)";

// ── Exposure zones (Warm Instrument). Fixed meaning — never decorative. ──
export const ZONE_COLORS = {
  E0: "#b06a1a", // insulated — above the waterline
  E1: "#146f9e", // augmented — at the waterline
  E2: "#0d8f6e", // automated — submerged
  alert: "#b23b3b", // below threshold
} as const;

export const ZONE_COLORS_DARK = {
  E0: "#b5793a",
  E1: "#3f8fc2",
  E2: "#3fa98d",
  alert: "#cf5a5a",
} as const;

export const ZONE_LABELS = {
  E0: "Insulated",
  E1: "Augmented",
  E2: "Automated",
} as const;

// Soft zone backgrounds (light) — warm-instrument tints of the zone hues.
export const ZONE_BG = {
  E0: "#f6efe6",
  E1: "#e8f1f6",
  E2: "#e6f2ee",
  alert: "#f6e9e9",
} as const;

// ── Per-signal source hues (provenance dots, signal panels). ──
export const SIGNAL_COLORS = {
  eloundou: "#a02f5c",
  microsoft: "#1f6fd6",
  aei: "#0e9a72",
  gdpval: "#9c3f14",
  jsa: "#4a9440",
} as const;

// ── Type system — system stacks only, no font embedding (brand brief §8). ──
export const TYPE = {
  display: "Georgia, 'Times New Roman', serif",
  body: "'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: "'Consolas', 'SF Mono', ui-monospace, monospace",
} as const;

// ── Fixed data conventions (brand brief §8). β = E1 + 0.5·E2. ──
export const BETA_SCALE = { min: 0, max: 1.5, median: 0.27 } as const;
export const ZONE_THRESHOLDS = { E2: 0.85, E1: 0.4 } as const; // E2 ≥ 0.85; E1 0.40–0.85; E0 < 0.40

// ── Legacy palettes retained until each is redesigned (see header note). ──
export const CLASSIFICATION_COLORS = {
  departing: "#DC2626",
  enduring: "#2563EB",
  emerging: "#8B5CF6",
  below_threshold: "#F97316",
} as const;

export const GDPVAL_COLORS = {
  primary: "#C2410C", // burnt orange — text, borders
  bg: "#FFF7ED", // soft orange — backgrounds
  border: "#FDBA74", // warm orange — borders, range lines
  dark: "#92400E", // deep brown — secondary text
  reward: "#16A34A", // green — positive score endpoints
  penalty: "#DC2626", // red — negative score endpoints
} as const;

export const AEI_COLORS = {
  primary: "#16A34A", // green — main text and accents
  bg: "#F0FDF4", // soft green — backgrounds
  border: "#86EFAC", // light green — borders, augmentation bars
  dark: "#15803D", // deep green — secondary text
  automation: "#16A34A", // solid green — full automation bars
  augmentation: "#86EFAC", // light green — human-in-the-loop bars
  growing: "#DC2626", // red — growing trend indicator
  stable: "#A1A1AA", // grey — stable trend
  declining: "#E4E4E7", // light grey — declining trend
} as const;

export const CLASSIFICATION_LABELS = {
  departing: "Departing",
  enduring: "Enduring",
  emerging: "Emerging",
  below_threshold: "Below Threshold",
} as const;
