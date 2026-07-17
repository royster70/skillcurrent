/**
 * RegionBadge — "which labour market is this reading from?" (GitHub #74).
 *
 * The SOL review's finding: an Australian visitor can reasonably assume the
 * employment numbers are Australian, because nothing on the result views says
 * otherwise. Every result surface now carries this small provenance chip.
 *
 * US-only surfaces (occupation detail, search — O*NET/OEWS data) render it
 * with a fixed region="US" regardless of the visitor's selected market:
 * never show "AU" over US data.
 */

import { THEME, TYPE } from "../lib/constants";
import type { Region } from "../lib/region";

const t = THEME.light;

const SOURCES: Record<Region, { flag: string; label: string; systems: string }> = {
  US: { flag: "🇺🇸", label: "US data", systems: "O*NET · BLS" },
  AU: { flag: "🇦🇺", label: "AU data", systems: "OSCA · ABS" },
};

export function RegionBadge({ region, note }: { region: Region; note?: string }) {
  const s = SOURCES[region];
  return (
    <span
      title={note ?? `${s.label} — ${s.systems}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: TYPE.body,
        padding: "2px 9px",
        borderRadius: 12,
        color: t.inkMuted,
        backgroundColor: t.ground,
        border: `1px solid ${t.line}`,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>{s.flag}</span>
      {s.label}
      <span style={{ fontWeight: 400, fontFamily: TYPE.mono, fontSize: 9.5 }}>{s.systems}</span>
    </span>
  );
}
