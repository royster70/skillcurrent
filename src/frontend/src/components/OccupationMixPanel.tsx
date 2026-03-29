/**
 * OccupationMixPanel — colour-coded Census occupation mix display.
 *
 * Static panel (data passed via props, no lazy load).
 * Shows ANZSCO major groups with proportional dots and percentages.
 */

import type { OccupationMixEntry } from "../lib/api";

interface Props {
  mix: OccupationMixEntry[];
  compact?: boolean;
}

const GROUP_COLORS = [
  "#2563EB", // Blue — Managers
  "#7C3AED", // Purple — Professionals
  "#D97706", // Amber — Technicians
  "#16A34A", // Green — Community/Personal
  "#DC2626", // Red — Clerical/Admin
  "#0891B2", // Cyan — Sales
  "#475569", // Slate — Machinery
  "#EC4899", // Pink — Labourers
] as const;

export function OccupationMixPanel({ mix, compact = false }: Props) {
  if (!mix || mix.length === 0) return null;

  return (
    <div style={{
      borderRadius: 12,
      border: "1.5px solid #E4E4E7",
      padding: compact ? "12px 16px" : "16px 20px",
      background: "#fff",
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "#18181B", fontFamily: "Inter, system-ui, sans-serif" }}>
        Workforce Composition
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {mix.map((entry, i) => (
          <div key={entry.major_group_name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length],
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, fontSize: 12, color: "#374151", fontFamily: "Inter, system-ui, sans-serif" }}>
              {entry.major_group_name}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#18181B", fontFamily: "Inter, system-ui, sans-serif" }}>
              {entry.share_pct}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
