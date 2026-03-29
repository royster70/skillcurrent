/**
 * WorkforceProfileCards — horizontal card grid for top occupation groups.
 *
 * Shows top 4 ANZSCO major groups as compact metric cards.
 * Used in CompanyLookup classify result and sector detail page.
 */

import type { OccupationMixEntry } from "../lib/api";

interface Props {
  profile: OccupationMixEntry[];
}

const CARD_COLORS = [
  { bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  { bg: "#F5F3FF", text: "#7C3AED", border: "#DDD6FE" },
  { bg: "#FFFBEB", text: "#D97706", border: "#FDE68A" },
  { bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
] as const;

export function WorkforceProfileCards({ profile }: Props) {
  if (!profile || profile.length === 0) return null;

  const top = profile.slice(0, 4);

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {top.map((entry, i) => {
        const colors = CARD_COLORS[i % CARD_COLORS.length];
        return (
          <div
            key={entry.major_group_name}
            style={{
              flex: "1 1 120px",
              padding: "10px 14px",
              borderRadius: 10,
              backgroundColor: colors.bg,
              border: `1px solid ${colors.border}`,
              minWidth: 120,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: colors.text, fontFamily: "Inter, system-ui, sans-serif" }}>
              {entry.share_pct}%
            </div>
            <div style={{ fontSize: 11, color: colors.text, opacity: 0.8, marginTop: 2, fontFamily: "Inter, system-ui, sans-serif", lineHeight: 1.3 }}>
              {entry.major_group_name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
