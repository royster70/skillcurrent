/**
 * SubdivisionBarPanel — collapsible panel showing ANZSIC subdivision breakdown.
 *
 * Lazy-loads subdivision data from the API when expanded.
 * Horizontal bars proportional to employment, sorted descending.
 */

import { useApi } from "../hooks/useApi";
import { api, type SubdivisionEntry } from "../lib/api";

interface Props {
  sectorCode: string;
  expanded: boolean;
  onToggle: () => void;
}

const COLORS = {
  primary: "#6366F1",  // indigo
  bg: "#EEF2FF",
  border: "#C7D2FE",
  dark: "#3730A3",
} as const;

export function SubdivisionBarPanel({ sectorCode, expanded, onToggle }: Props) {
  const { data, loading } = useApi(
    () => expanded ? api.sectorSubdivisions(sectorCode) : Promise.resolve(null as unknown as SubdivisionEntry[]),
    [sectorCode, expanded],
  );

  const subs = data || [];
  const maxEmp = subs.length > 0 ? Math.max(...subs.map((s) => s.employment || 0)) : 1;

  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${COLORS.border}`,
      overflow: "hidden",
      transition: "all 0.3s ease",
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 20px",
          backgroundColor: COLORS.bg,
          borderBottom: expanded ? `1px solid ${COLORS.border}40` : "none",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x={3} y={3} width={7} height={7} />
            <rect x={14} y={3} width={7} height={7} />
            <rect x={3} y={14} width={7} height={7} />
            <rect x={14} y={14} width={7} height={7} />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.primary, fontFamily: "Inter, system-ui, sans-serif" }}>
            Sub-sector Breakdown
          </span>
          <span style={{ fontSize: 13, color: COLORS.dark, fontFamily: "Inter, system-ui, sans-serif" }}>
            &middot; ANZSIC subdivisions
          </span>
        </div>
        <svg
          width={16} height={16} viewBox="0 0 24 24" fill="none"
          stroke={COLORS.primary} strokeWidth={2}
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: "16px 20px" }}>
          {loading && <div style={{ fontSize: 12, color: "#94A3B8" }}>Loading subdivisions...</div>}
          {!loading && subs.length === 0 && (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>No subdivision data available for this sector.</div>
          )}
          {!loading && subs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {subs.map((sub) => (
                <div key={sub.subdivision_name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 200, fontSize: 12, color: "#374151", fontFamily: "Inter, system-ui, sans-serif", flexShrink: 0 }}>
                    {sub.subdivision_name}
                  </div>
                  <div style={{ flex: 1, height: 14, backgroundColor: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${((sub.employment || 0) / maxEmp) * 100}%`,
                      backgroundColor: COLORS.primary,
                      borderRadius: 4,
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                  <div style={{ width: 80, fontSize: 11, color: "#71717A", textAlign: "right", fontFamily: "Inter, system-ui, sans-serif" }}>
                    {fmtNum(sub.employment)} ({sub.share_pct}%)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtNum(n: number | null): string {
  if (n == null) return "\u2014";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
