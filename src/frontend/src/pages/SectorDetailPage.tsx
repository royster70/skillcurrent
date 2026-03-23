import { useParams, useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { ZONE_COLORS } from "../lib/constants";

export function SectorDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { data: occupations, loading, error } = useApi(
    () => api.sectorOccupations(code!), [code]
  );

  if (loading) return <div>Loading sector...</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;
  if (!occupations || !code) return null;

  // Top occupations by headcount
  const topByHeadcount = occupations
    .filter((o) => o.headcount)
    .sort((a, b) => (b.headcount || 0) - (a.headcount || 0))
    .slice(0, 12)
    .map((o) => ({
      name: o.title.length > 30 ? o.title.slice(0, 30) + "..." : o.title,
      headcount: (o.headcount || 0) / 1000,
      zone: o.dominant_zone,
      soc: o.soc_code,
    }));

  // Three-tier scores for top occupations
  const scoreComparison = occupations
    .filter((o) => o.eloundou_beta != null)
    .sort((a, b) => (b.eloundou_beta || 0) - (a.eloundou_beta || 0))
    .slice(0, 10)
    .map((o) => ({
      name: o.title.length > 25 ? o.title.slice(0, 25) + "..." : o.title,
      Eloundou: o.eloundou_beta || 0,
      Microsoft: o.ms_ai_applicability || 0,
      AEI: o.aei_exposure || 0,
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <button onClick={() => navigate("/")}
          style={{ fontSize: 13, color: "#2563EB", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}>
          ← Back to Sectors
        </button>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Sector: {code}</h1>
        <p style={{ fontSize: 14, color: "#71717A", margin: "4px 0 0" }}>
          {occupations.length} occupations in this sector
        </p>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Employment by occupation */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Top Occupations by Employment (K)</div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={topByHeadcount} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="headcount" barSize={14} radius={[0, 4, 4, 0]}>
                {topByHeadcount.map((d, i) => (
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
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Highest Exposure (Three-Tier Scores)</div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={scoreComparison} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="Eloundou" fill={ZONE_COLORS.E0} barSize={6} radius={[0, 3, 3, 0]} />
              <Bar dataKey="Microsoft" fill={ZONE_COLORS.E1} barSize={6} radius={[0, 3, 3, 0]} />
              <Bar dataKey="AEI" fill={ZONE_COLORS.E2} barSize={6} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Occupation table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: "#F9FAFB" }}>
              <th style={th}>Occupation</th>
              <th style={{ ...th, textAlign: "right" }}>Headcount</th>
              <th style={{ ...th, textAlign: "right" }}>Eloundou β</th>
              <th style={{ ...th, textAlign: "right" }}>MS AI</th>
              <th style={{ ...th, textAlign: "center" }}>Zone</th>
              <th style={{ ...th, textAlign: "center" }}>Drift</th>
            </tr>
          </thead>
          <tbody>
            {occupations.slice(0, 30).map((o) => (
              <tr key={o.soc_code} style={{ borderTop: "1px solid #E4E4E7", cursor: "pointer" }}
                onClick={() => navigate(`/occupations`)}
              >
                <td style={td}>
                  <div style={{ fontWeight: 500 }}>{o.title}</div>
                  <div style={{ fontSize: 11, color: "#A1A1AA" }}>{o.soc_code}</div>
                </td>
                <td style={{ ...td, textAlign: "right" }}>{o.headcount?.toLocaleString() || "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{o.eloundou_beta?.toFixed(3) || "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{o.ms_ai_applicability?.toFixed(3) || "—"}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  {o.dominant_zone && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                      color: ZONE_COLORS[o.dominant_zone as keyof typeof ZONE_COLORS] || "#71717A",
                      backgroundColor: (ZONE_COLORS[o.dominant_zone as keyof typeof ZONE_COLORS] || "#71717A") + "15",
                    }}>
                      {o.dominant_zone}
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: "center", fontSize: 11, color: "#71717A" }}>
                  {o.drift_classification || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 16px", fontWeight: 600, fontSize: 12, color: "#71717A", textAlign: "left" };
const td: React.CSSProperties = { padding: "10px 16px" };
