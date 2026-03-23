import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { ZONE_COLORS, ZONE_BG } from "../lib/constants";
import { MetricCard } from "../components/MetricCard";

export function SectorsPage() {
  const { data, loading, error } = useApi(() => api.sectors(), []);
  const { data: drift } = useApi(() => api.driftSummary(), []);
  const navigate = useNavigate();

  if (loading) return <div>Loading sectors...</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;
  if (!data) return null;

  const sectors = data.sectors;

  // Aggregate zone counts
  const totalE0 = sectors.reduce((s, x) => s + x.zone_e0_count, 0);
  const totalE1 = sectors.reduce((s, x) => s + x.zone_e1_count, 0);
  const totalE2 = sectors.reduce((s, x) => s + x.zone_e2_count, 0);
  const totalEmp = sectors.reduce((s, x) => s + (x.total_employment || 0), 0);

  // Zone pie data
  const zonePie = [
    { name: "Insulated (E0)", value: totalE0, fill: ZONE_COLORS.E0 },
    { name: "Augmented (E1)", value: totalE1, fill: ZONE_COLORS.E1 },
    { name: "Automated (E2)", value: totalE2, fill: ZONE_COLORS.E2 },
  ];

  // Three-tier comparison for top sectors
  const threeScores = sectors.slice(0, 8).map((s) => ({
    name: s.naics_title.length > 20 ? s.naics_title.slice(0, 20) + "..." : s.naics_title,
    Eloundou: s.avg_eloundou_beta || 0,
    Microsoft: s.avg_ms_applicability || 0,
    AEI: s.avg_aei_exposure || 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Industry Sectors</h1>
        <p style={{ fontSize: 14, color: "#71717A", margin: "4px 0 0" }}>
          AI exposure analysis across {data.total_sectors} NAICS sectors
          {" "}· {(totalEmp / 1_000_000).toFixed(1)}M US workers
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: "flex", gap: 16 }}>
        <MetricCard label="INSULATED (E0)" value={`${(totalE0).toLocaleString()}`}
          subtitle={`occupations with Beta < 0.40`} color={ZONE_COLORS.E0} />
        <MetricCard label="AUGMENTED (E1)" value={`${totalE1.toLocaleString()}`}
          subtitle={`occupations with Beta 0.40–0.85`} color={ZONE_COLORS.E1} />
        <MetricCard label="AUTOMATED (E2)" value={`${totalE2.toLocaleString()}`}
          subtitle={`occupations with Beta ≥ 0.85`} color={ZONE_COLORS.E2} />
        <MetricCard label="BELOW THRESHOLD" value={String(drift?.below_threshold || 0)}
          subtitle="Tasks approaching zone flip" color={ZONE_COLORS.alert}
          bgColor={ZONE_BG.alert} borderColor="#FECACA" />
      </div>

      {/* Charts row */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Zone distribution pie */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Zone Distribution</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={zonePie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius={60} outerRadius={100} paddingAngle={2}>
                {zonePie.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Three-tier comparison by sector */}
        <div style={{ flex: 2, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Three-Tier Evidence by Sector</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={threeScores} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" domain={[0, "auto"]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Eloundou" fill="#F97316" barSize={8} radius={[0, 4, 4, 0]} />
              <Bar dataKey="Microsoft" fill="#2563EB" barSize={8} radius={[0, 4, 4, 0]} />
              <Bar dataKey="AEI" fill="#16A34A" barSize={8} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sector table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", overflow: "hidden" }}>
        <div style={{ fontSize: 16, fontWeight: 600, padding: "16px 20px", borderBottom: "1px solid #E4E4E7" }}>
          Sectors by Employment
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ backgroundColor: "#F9FAFB" }}>
              <th style={th}>Sector</th>
              <th style={{ ...th, textAlign: "right" }}>Employment</th>
              <th style={{ ...th, textAlign: "right" }}>Eloundou β</th>
              <th style={{ ...th, textAlign: "right" }}>MS AI</th>
              <th style={{ ...th, textAlign: "right" }}>AEI</th>
              <th style={{ ...th, textAlign: "center", color: ZONE_COLORS.E0 }}>E0</th>
              <th style={{ ...th, textAlign: "center", color: ZONE_COLORS.E1 }}>E1</th>
              <th style={{ ...th, textAlign: "center", color: ZONE_COLORS.E2 }}>E2</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => (
              <tr key={s.naics_code}
                onClick={() => navigate(`/sectors/${s.naics_code}`)}
                style={{ cursor: "pointer", borderTop: "1px solid #E4E4E7" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F9FAFB")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <td style={td}>{s.naics_title}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtEmp(s.total_employment)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(s.avg_eloundou_beta)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(s.avg_ms_applicability)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(s.avg_aei_exposure)}</td>
                <td style={{ ...td, textAlign: "center", color: ZONE_COLORS.E0, fontWeight: 600 }}>{s.zone_e0_count}</td>
                <td style={{ ...td, textAlign: "center", color: ZONE_COLORS.E1, fontWeight: 600 }}>{s.zone_e1_count}</td>
                <td style={{ ...td, textAlign: "center", color: ZONE_COLORS.E2, fontWeight: 600 }}>{s.zone_e2_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helpers
const th: React.CSSProperties = { padding: "10px 16px", fontWeight: 600, fontSize: 12, color: "#71717A", letterSpacing: 0.5, textAlign: "left" };
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
