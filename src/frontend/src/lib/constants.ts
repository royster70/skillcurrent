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

export const CLASSIFICATION_LABELS = {
  departing: "Departing",
  enduring: "Enduring",
  emerging: "Emerging",
  below_threshold: "Below Threshold",
} as const;
