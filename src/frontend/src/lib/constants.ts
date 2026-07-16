/** SkillCurrent design tokens — the "Warm Instrument" system.
 *
 * Replaces the legacy Pencil / orange palette. Zone hues are REASSIGNED per the
 * brand brief (src/frontend/design/skillcurrent-brand-brief.md §7) — do NOT mix
 * old and new. Light is the default; dark is first-class.
 *
 * Panel palettes (GDPVAL_COLORS / AEI_COLORS) are kept as-is for now; each is
 * re-skinned when its panel is redesigned (§10). The old CLASSIFICATION_* pair
 * became MOVEMENT_LABELS/MOVEMENT_COLORS with the Rising Tide redesign.
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
  E0: "#b06a1a", // insulated — above the waterline (warm amber)
  E1: "#1663ab", // augmented — at the waterline (clear blue)
  E2: "#2c9a5f", // high automation potential — submerged (clear green; widened from teal so E1≠E2)
  alert: "#b23b3b", // below threshold
} as const;

export const ZONE_COLORS_DARK = {
  E0: "#b5793a",
  E1: "#4b93cc",
  E2: "#52b078",
  alert: "#cf5a5a",
} as const;

export const ZONE_LABELS = {
  E0: "Insulated",
  E1: "Augmented",
  // "High automation potential", not "Automated" — β reads capability, not
  // deployment. A task can be technically automatable yet stay human-led
  // (regulation, liability, workflow integration, economics).
  E2: "High automation potential",
} as const;

// Hover qualifiers for bare zone chips — the one place a user can ask
// "what does this label actually claim?" without leaving the page.
export const ZONE_TITLES = {
  E0: "E0 — Insulated: human-led work today's AI barely reaches (β < 0.40)",
  E1: "E1 — Augmented: AI assists on routine parts while humans lead (β 0.40–0.85)",
  E2: "E2 — High automation potential: AI can perform much of this task; whether it does depends on tools, controls and context (β ≥ 0.85)",
} as const;

// Soft zone backgrounds (light) — warm-instrument tints of the zone hues.
export const ZONE_BG = {
  E0: "#f6efe6",
  E1: "#e1ecf8", // clearer blue tint
  E2: "#ddf1e2", // clearer green tint (widened from teal so the E1/E2 bands read apart)
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

// ── Movement (tide) vocabulary — how AI *usage* is trending per task. ──
// Keys are the API's drift_classification values (data contract, unchanged);
// labels/colours are the user-facing "Rising Tide" system. Colour-by-role:
// rising MOVES → the `current` hue; holding = still ink; at-the-waterline =
// the alert; surfacing = brass (a new mark on the chart); uncharted = muted.
export const MOVEMENT_LABELS = {
  departing: "Rising",
  enduring: "Holding fast",
  emerging: "Surfacing",
  below_threshold: "At the waterline",
  unclassified: "Uncharted",
} as const;

export const MOVEMENT_COLORS = {
  departing: THEME.light.current,
  enduring: THEME.light.ink,
  emerging: THEME.light.brass,
  below_threshold: ZONE_COLORS.alert,
  unclassified: THEME.light.inkMuted,
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
