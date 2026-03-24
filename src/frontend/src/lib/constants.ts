/** Design constants matching Pencil design system. */

export const ZONE_COLORS = {
  E0: "#F97316", // orange — insulated
  E1: "#2563EB", // blue — augmented
  E2: "#16A34A", // green — automated
  alert: "#DC2626", // red — below threshold
} as const;

export const ZONE_LABELS = {
  E0: "Insulated",
  E1: "Augmented",
  E2: "Automated",
} as const;

export const ZONE_BG = {
  E0: "#FFF7ED",
  E1: "#EFF6FF",
  E2: "#F0FDF4",
  alert: "#FEF2F2",
} as const;

export const CLASSIFICATION_COLORS = {
  departing: "#DC2626",
  enduring: "#2563EB",
  emerging: "#8B5CF6",
  below_threshold: "#F97316",
} as const;

export const GDPVAL_COLORS = {
  primary: "#C2410C",    // burnt orange — text, borders
  bg: "#FFF7ED",         // soft orange — backgrounds
  border: "#FDBA74",     // warm orange — borders, range lines
  dark: "#92400E",       // deep brown — secondary text
  reward: "#16A34A",     // green — positive score endpoints
  penalty: "#DC2626",    // red — negative score endpoints
} as const;

export const AEI_COLORS = {
  primary: "#16A34A",    // green — main text and accents
  bg: "#F0FDF4",         // soft green — backgrounds
  border: "#86EFAC",     // light green — borders, augmentation bars
  dark: "#15803D",       // deep green — secondary text
  automation: "#16A34A", // solid green — full automation bars
  augmentation: "#86EFAC", // light green — human-in-the-loop bars
  growing: "#DC2626",    // red — growing trend indicator
  stable: "#A1A1AA",     // grey — stable trend
  declining: "#E4E4E7",  // light grey — declining trend
} as const;

export const CLASSIFICATION_LABELS = {
  departing: "Departing",
  enduring: "Enduring",
  emerging: "Emerging",
  below_threshold: "Below Threshold",
} as const;
