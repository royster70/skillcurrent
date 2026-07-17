/**
 * Shared occupation header chips — the zone reading and the tide (direction of
 * change) indicator. Extracted from OccupationsPage's inline definitions so the
 * one-page brief (#85) reads exactly the same instruments as the detail panel.
 *
 * Both honour the active language lexicon (#79): the zone/movement words come
 * from `lex`, the raw β / velocity jargon stays in the tooltip.
 */

import { ZONE_COLORS, MOVEMENT_COLORS, THEME } from "../lib/constants";
import { useLanguage } from "../lib/language";

const theme = THEME.light;

// Directional glyph per tide state — the word carries the meaning; the arrow
// is a quick-read echo.
const TIDE_GLYPH: Record<string, string> = {
  departing: "↑", // Rising — AI usage climbing era over era
  emerging: "↗", // Surfacing — new tasks appearing
  enduring: "→", // Holding fast — stable
  below_threshold: "≈", // At the waterline — about to flip
  unclassified: "·",
};

/** Direction-of-change chip from a role's dominant task movement. Null when the
 * occupation has no drift signal. */
export function TideChip({ classification, velocity }: { classification: string | null; velocity: number | null }) {
  const { lex } = useLanguage();
  if (!classification) return null;
  const key = classification as keyof typeof lex.movementLabels;
  const color = MOVEMENT_COLORS[key] ?? theme.inkMuted;
  const label = lex.movementLabels[key] ?? classification;
  const glyph = TIDE_GLYPH[classification] ?? TIDE_GLYPH.unclassified;
  return (
    <span
      title={`${lex.headline.direction}: ${label} (${lex.fmt.driftTooltip(velocity)})`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 16,
        color, backgroundColor: color + "15", border: `1px solid ${color}40`,
      }}
    >
      <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{glyph}</span>
      {label}
    </span>
  );
}

/** Dominant-zone chip (E0/E1/E2 → the active lexicon's label). Null when the
 * occupation has no zone. */
export function ZoneChip({ zone }: { zone: string | null }) {
  const { lex } = useLanguage();
  if (!zone) return null;
  const color = ZONE_COLORS[zone as keyof typeof ZONE_COLORS] ?? theme.inkMuted;
  return (
    <span
      title={lex.zoneTitles[zone as keyof typeof lex.zoneTitles]}
      style={{
        fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 16,
        color, backgroundColor: color + "15", border: `1px solid ${color}40`,
      }}
    >
      {lex.zoneLabels[zone as keyof typeof lex.zoneLabels] || zone}
    </span>
  );
}
