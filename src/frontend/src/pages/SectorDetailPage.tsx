import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useApi } from "../hooks/useApi";
import { api, type PriorityRole } from "../lib/api";
import { ZONE_COLORS, CLASSIFICATION_COLORS } from "../lib/constants";

export function SectorDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [showFullMix, setShowFullMix] = useState(false);

  const { data, loading, error } = useApi(
    () => api.sectorPriorities(code!, 10), [code]
  );

  if (loading) return <div>Loading sector...</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;
  if (!data || !code) return null;

  const displayRoles = showFullMix ? data.full_mix : data.priority_roles;

  // Impact score chart for priority roles
  const impactBars = data.priority_roles.map((r) => ({
    name: r.occupation_title.length > 30 ? r.occupation_title.slice(0, 30) + "..." : r.occupation_title,
    impact: (r.impact_score || 0) * 100,
    zone: r.dominant_zone,
    headcount: r.headcount,
  }));

  // Three-tier comparison for priority roles
  const threeScores = data.priority_roles.slice(0, 8).map((r) => ({
    name: r.occupation_title.length > 22 ? r.occupation_title.slice(0, 22) + "..." : r.occupation_title,
    Eloundou: r.eloundou_beta || 0,
    Microsoft: r.ms_ai_applicability || 0,
    AEI: r.aei_exposure || 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <button onClick={() => navigate("/")}
          style={{ fontSize: 13, color: "#2563EB", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}>
          ← Back to Sectors
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>{data.naics_title}</h1>
        <p style={{ fontSize: 14, color: "#71717A", margin: "4px 0 0" }}>
          NAICS {data.naics_code} · {data.occupation_count} occupations
          {data.total_employment ? ` · ${(data.total_employment / 1_000_000).toFixed(1)}M workers` : ""}
        </p>
      </div>

      {/* Charts row */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Priority impact scores */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Priority Roles — Impact Score</div>
          <div style={{ fontSize: 12, color: "#71717A", marginBottom: 16 }}>
            Composite of AI exposure, headcount, concentration, and drift velocity
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={impactBars} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(val: number) => [`${val.toFixed(1)}`, "Impact Score"]} />
              <Bar dataKey="impact" barSize={14} radius={[0, 4, 4, 0]}>
                {impactBars.map((d, i) => (
                  <Cell key={i} fill={
                    d.zone === "E2" ? ZONE_COLORS.E2 :
                    d.zone === "E1" ? ZONE_COLORS.E1 :
                    d.zone === "E0" ? ZONE_COLORS.E0 : "#94A3B8"
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Three-tier comparison */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Three-Tier Evidence Comparison</div>
          <div style={{ fontSize: 12, color: "#71717A", marginBottom: 16 }}>
            Theoretical (Eloundou) vs empirical (Microsoft, AEI) for priority roles
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={threeScores} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="Eloundou" fill={ZONE_COLORS.E0} barSize={6} radius={[0, 3, 3, 0]} />
              <Bar dataKey="Microsoft" fill={ZONE_COLORS.E1} barSize={6} radius={[0, 3, 3, 0]} />
              <Bar dataKey="AEI" fill={ZONE_COLORS.E2} barSize={6} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Role table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E4E4E7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {showFullMix ? "All Occupations" : "Priority Roles"}
            </span>
            <span style={{ fontSize: 13, color: "#71717A", marginLeft: 8 }}>
              {showFullMix ? `${data.full_mix.length} occupations` : `Top ${data.priority_roles.length} by impact`}
            </span>
          </div>
          <button
            onClick={() => setShowFullMix(!showFullMix)}
            style={{
              fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 8,
              border: "1px solid #E4E4E7", backgroundColor: "#fff", cursor: "pointer",
              color: "#2563EB",
            }}
          >
            {showFullMix ? "Show Priority Only" : `Show All ${data.occupation_count} Roles`}
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: "#F9FAFB" }}>
              <th style={th}>Occupation</th>
              <th style={{ ...th, textAlign: "right", width: 80 }}>Headcount</th>
              <th style={{ ...th, textAlign: "right", width: 50 }}>LQ</th>
              <th style={{ ...th, textAlign: "right", width: 70 }}>Eloundou</th>
              <th style={{ ...th, textAlign: "right", width: 60 }}>MS AI</th>
              <th style={{ ...th, textAlign: "center", width: 50 }}>Zone</th>
              <th style={{ ...th, textAlign: "center", width: 60 }}>Drift</th>
              <th style={{ ...th, textAlign: "right", width: 60 }}>Impact</th>
              <th style={{ ...th, width: 200 }}>Risk Factors</th>
            </tr>
          </thead>
          <tbody>
            {displayRoles.map((r) => (
              <RoleRow key={r.soc_code} role={r} navigate={navigate} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleRow({ role: r, navigate }: { role: PriorityRole; navigate: ReturnType<typeof useNavigate> }) {
  const zoneColor = r.dominant_zone ? ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] : "#71717A";
  const driftColor = r.drift_classification ? CLASSIFICATION_COLORS[r.drift_classification as keyof typeof CLASSIFICATION_COLORS] : "#71717A";

  return (
    <tr style={{ borderTop: "1px solid #E4E4E7", cursor: "pointer" }}
      onClick={() => navigate("/occupations")}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F9FAFB")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <td style={td}>
        <div style={{ fontWeight: 500 }}>{r.occupation_title}</div>
        <div style={{ fontSize: 11, color: "#A1A1AA" }}>{r.soc_code}</div>
      </td>
      <td style={{ ...td, textAlign: "right" }}>{fmtNum(r.headcount)}</td>
      <td style={{ ...td, textAlign: "right", fontWeight: r.location_quotient && r.location_quotient > 2 ? 600 : 400, color: r.location_quotient && r.location_quotient > 2 ? "#DC2626" : "#18181B" }}>
        {r.location_quotient?.toFixed(1) || "—"}
      </td>
      <td style={{ ...td, textAlign: "right" }}>{r.eloundou_beta?.toFixed(2) || "—"}</td>
      <td style={{ ...td, textAlign: "right" }}>{r.ms_ai_applicability?.toFixed(2) || "—"}</td>
      <td style={{ ...td, textAlign: "center" }}>
        {r.dominant_zone && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
            color: zoneColor, backgroundColor: zoneColor + "15",
          }}>
            {r.dominant_zone}
          </span>
        )}
      </td>
      <td style={{ ...td, textAlign: "center" }}>
        {r.drift_classification && (
          <span style={{ fontSize: 11, fontWeight: 500, color: driftColor }}>
            {r.drift_classification === "departing" ? "↑" : r.drift_classification === "enduring" ? "→" : "⚠"}
          </span>
        )}
      </td>
      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
        {r.impact_score != null ? (r.impact_score * 100).toFixed(0) : "—"}
      </td>
      <td style={td}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {r.risk_factors.map((f, i) => (
            <span key={i} style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 4,
              backgroundColor: "#FEF2F2", color: "#DC2626",
            }}>
              {f}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: 11, color: "#71717A", textAlign: "left", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px" };

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString();
}
