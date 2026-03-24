/**
 * CompositeSectorPage — blended multi-sector impact analysis.
 *
 * Reads ?codes=62,54,51 from URL, fetches composite data, and displays:
 * - Sector chip badges (read-only, zone-coloured)
 * - Employment-weighted metric cards (E0/E1/E2 + composite Beta)
 * - Unified occupation table with multi-sector badges
 * - Auto-generated narrative summary
 */

import { useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api, type CompositeSectorResponse } from "../lib/api";
import { ZONE_COLORS, ZONE_BG } from "../lib/constants";
import { MetricCard } from "../components/MetricCard";

export function CompositeSectorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const codes = (searchParams.get("codes") || "").split(",").filter(Boolean);

  const { data, loading, error } = useApi(
    () => codes.length >= 2 ? api.compositeAnalysis(codes) : Promise.reject("Need 2+ codes"),
    [searchParams.get("codes")],
  );

  if (codes.length < 2) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Composite Sector Analysis</h1>
        <p style={{ color: "#71717A", marginTop: 8 }}>
          Select 2 or more sectors from the{" "}
          <a href="/" style={{ color: "#2563EB" }}>Sectors page</a>{" "}
          to build a composite view.
        </p>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 32 }}>Loading composite analysis...</div>;
  if (error) return <div style={{ padding: 32, color: "red" }}>Error: {error}</div>;
  if (!data) return null;

  return <CompositeContent data={data} navigate={navigate} />;
}

// ── Main content (separated for cleaner rendering) ──

function CompositeContent({
  data,
  navigate,
}: {
  data: CompositeSectorResponse;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const totalEmp = data.total_employment;
  const narrative = generateNarrative(data);

  // Sector abbreviations for compact badges
  const sectorAbbrev = useMemo(() => {
    const map: Record<string, { abbrev: string; zone: "E0" | "E1" | "E2" }> = {};
    data.sector_names.forEach((name) => {
      // Create short abbrev: "Health Care and Social Assistance" → "HC"
      const words = name.replace(/\band\b/gi, "").replace(/[,&]/g, "").trim().split(/\s+/);
      const abbrev = words.length === 1
        ? words[0].slice(0, 4)
        : words.filter(w => w.length > 2).map(w => w[0]).join("").slice(0, 4);
      map[name] = { abbrev, zone: "E0" }; // zone determined below
    });
    return map;
  }, [data.sector_names]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>
          Composite Sector Analysis
        </h1>
        <p style={{ fontSize: 14, color: "#71717A", margin: "4px 0 0" }}>
          {data.codes.length} sectors combined · {fmtEmp(totalEmp)} workers
          · employment-weighted exposure profile
        </p>
      </div>

      {/* Sector chips (read-only) + back link */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 1,
          color: "#A1A1AA", fontFamily: "Inter, system-ui, sans-serif",
        }}>SECTORS</span>
        {data.sector_names.map((name) => (
          <div
            key={name}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              borderRadius: 99, padding: "6px 12px 6px 8px",
              background: ZONE_BG.E1,
              border: "1px solid #93C5FD",
              fontSize: 12, fontWeight: 500,
              fontFamily: "Inter, system-ui, sans-serif",
              color: "#1E40AF",
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563EB" }} />
            {name}
          </div>
        ))}
        <button
          onClick={() => navigate("/")}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: "pointer",
            padding: "6px 12px", borderRadius: 8,
            fontSize: 12, fontWeight: 500, color: "#71717A",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1={19} y1={12} x2={5} y2={12} />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Edit sectors
        </button>
      </div>

      {/* Metric cards */}
      <div style={{ display: "flex", gap: 16 }}>
        <MetricCard
          label="INSULATED (E0)"
          value={fmtEmp(data.workers_e0)}
          subtitle={`${pct(data.workers_e0, totalEmp)} of composite workforce`}
          color={ZONE_COLORS.E0}
        />
        <MetricCard
          label="AUGMENTED (E1)"
          value={fmtEmp(data.workers_e1)}
          subtitle={`${pct(data.workers_e1, totalEmp)} of composite workforce`}
          color={ZONE_COLORS.E1}
        />
        <MetricCard
          label="AUTOMATED (E2)"
          value={fmtEmp(data.workers_e2)}
          subtitle={`${pct(data.workers_e2, totalEmp)} of composite workforce`}
          color={ZONE_COLORS.E2}
        />
        <MetricCard
          label="WEIGHTED BETA"
          value={data.weighted_eloundou_beta?.toFixed(3) || "—"}
          subtitle="Composite exposure score"
          color="#6D28D9"
          bgColor="#F5F3FF"
          borderColor="#C4B5FD"
        />
      </div>

      {/* Occupation table */}
      <div style={{
        background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", overflow: "hidden",
      }}>
        <div style={{
          fontSize: 16, fontWeight: 600, padding: "16px 20px",
          borderBottom: "1px solid #E4E4E7",
        }}>
          Unified Occupations
          <span style={{ fontSize: 12, fontWeight: 400, color: "#A1A1AA", marginLeft: 8 }}>
            De-duplicated across {data.codes.length} sectors · sorted by combined headcount
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ backgroundColor: "#F9FAFB" }}>
              <th style={th}>Occupation</th>
              <th style={th}>Sectors</th>
              <th style={{ ...th, textAlign: "right" }}>Headcount</th>
              <th style={{ ...th, textAlign: "right" }}>W. Beta</th>
              <th style={{ ...th, textAlign: "right" }}>MS AI</th>
              <th style={{ ...th, textAlign: "right" }}>AEI</th>
              <th style={{ ...th, textAlign: "center" }}>Zone</th>
            </tr>
          </thead>
          <tbody>
            {data.occupations.slice(0, 50).map((occ) => (
              <tr
                key={occ.onet_soc}
                onClick={() => navigate(`/occupations?selected=${occ.onet_soc}`)}
                style={{ cursor: "pointer", borderTop: "1px solid #E4E4E7" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F9FAFB")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <td style={{ ...td, maxWidth: 260 }}>{occ.occupation_title}</td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {occ.sectors.map((sname) => {
                      const abbr = sectorAbbrev[sname];
                      return (
                        <span
                          key={sname}
                          title={sname}
                          style={{
                            fontSize: 10, fontWeight: 600,
                            padding: "2px 6px", borderRadius: 4,
                            background: ZONE_BG.E1,
                            color: "#1E40AF",
                          }}
                        >
                          {abbr?.abbrev || sname.slice(0, 4)}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td style={{ ...td, textAlign: "right" }}>{fmtEmp(occ.total_headcount)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(occ.eloundou_beta)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(occ.ms_ai_applicability)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(occ.aei_exposure)}</td>
                <td style={{
                  ...td, textAlign: "center", fontWeight: 600,
                  color: occ.dominant_zone ? ZONE_COLORS[occ.dominant_zone as keyof typeof ZONE_COLORS] : "#A1A1AA",
                }}>
                  {occ.dominant_zone || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{
          padding: "10px 16px", textAlign: "center",
          borderTop: "1px solid #E4E4E7", fontSize: 13, color: "#71717A",
        }}>
          {data.occupation_count} unique occupations across {data.codes.length} sectors
          {data.occupation_count > 50 && " · Showing top 50 by headcount"}
        </div>
      </div>

      {/* Narrative summary */}
      <div style={{
        background: "#1F1F23", borderRadius: 12, padding: "16px 20px",
        border: "1px solid #27272A",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: "#A1A1AA",
        }}>COMPOSITE INTELLIGENCE SUMMARY</div>
        <div style={{
          fontSize: 12, lineHeight: 1.6, color: "#A1A1AA",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          {narrative}
        </div>
        <div style={{ display: "flex", gap: 16, padding: "8px 0", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
            {fmtEmp(data.total_employment)} workers
          </span>
          <span style={{ color: "#52525B" }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: ZONE_COLORS.E0 }}>
            {pct(data.workers_e0, data.total_employment)} E0 zone
          </span>
          <span style={{ color: "#52525B" }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
            {data.occupation_count} unique occupations
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Narrative generation ──

function generateNarrative(data: CompositeSectorResponse): string {
  const names = data.sector_names;
  const nameStr = names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;

  const totalEmp = data.total_employment;
  const beta = data.weighted_eloundou_beta;
  const zone = beta != null
    ? beta >= 0.85 ? "Automated (E2)" : beta >= 0.4 ? "Augmented (E1)" : "Insulated (E0)"
    : "undetermined";

  // Find occupations that span the most sectors
  const crossSector = data.occupations.filter((o) => o.sectors.length >= names.length);
  const topCross = crossSector.length > 0 ? crossSector[0] : null;

  // Highest-exposure occupation
  const topExposed = [...data.occupations]
    .filter((o) => o.eloundou_beta != null)
    .sort((a, b) => (b.eloundou_beta || 0) - (a.eloundou_beta || 0))[0];

  let narrative = `This composite spans ${nameStr} — representing ${fmtEmp(totalEmp)} workers.`;

  if (beta != null) {
    narrative += ` The blended weighted Beta of ${beta.toFixed(3)} places the composite in the ${zone} zone.`;
  }

  if (topCross) {
    narrative += ` ${topCross.occupation_title} appears across all ${names.length} sectors (${fmtEmp(topCross.total_headcount)} workers), making it a key cross-sector workforce planning priority.`;
  }

  if (topExposed && topExposed !== topCross) {
    narrative += ` The highest-exposure role is ${topExposed.occupation_title} (Beta ${topExposed.eloundou_beta?.toFixed(3)}).`;
  }

  return narrative;
}

// ── Style + helpers ──

const th: React.CSSProperties = {
  padding: "10px 16px", fontWeight: 600, fontSize: 12,
  color: "#71717A", letterSpacing: 0.5, textAlign: "left",
};
const td: React.CSSProperties = { padding: "10px 16px" };

function fmtEmp(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtScore(n: number | null): string {
  return n != null ? n.toFixed(3) : "—";
}

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}
