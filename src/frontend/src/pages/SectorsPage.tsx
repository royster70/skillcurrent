import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { api, type SectorSummary } from "../lib/api";
import { ZONE_COLORS, ZONE_BG } from "../lib/constants";
import { MetricCard } from "../components/MetricCard";
import { CompanyLookup } from "../components/CompanyLookup";
import { SectorChipSelector } from "../components/SectorChipSelector";
import { ZoneExplainerPanel } from "../components/ZoneExplainerPanel";
import { RegionSelector } from "../components/RegionSelector";

export function SectorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const region = searchParams.get("region")?.toUpperCase() === "AU" ? "AU" : "US";
  const { data, loading, error } = useApi(() => api.sectors(region), [region]);
  const { data: drift } = useApi(() => api.driftSummary(), []);
  const navigate = useNavigate();
  const [pieMode, setPieMode] = useState<"workers" | "occupations">("workers");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const setRegion = (r: string) => {
    setSearchParams(r === "US" ? {} : { region: r });
    setSelectedSectors([]);
    setCompanyName(null);
  };

  if (loading) return <div>Loading sectors...</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;
  if (!data) return null;

  const sectors = data.sectors;

  // Aggregate worker counts by zone
  const workersE0 = sectors.reduce((s, x) => s + x.workers_e0, 0);
  const workersE1 = sectors.reduce((s, x) => s + x.workers_e1, 0);
  const workersE2 = sectors.reduce((s, x) => s + x.workers_e2, 0);
  const totalEmp = sectors.reduce((s, x) => s + (x.total_employment || 0), 0);

  // Aggregate occupation counts by zone (for toggle)
  const totalE0 = sectors.reduce((s, x) => s + x.zone_e0_count, 0);
  const totalE1 = sectors.reduce((s, x) => s + x.zone_e1_count, 0);
  const totalE2 = sectors.reduce((s, x) => s + x.zone_e2_count, 0);

  // Zone pie data — toggle between workers and occupations
  const zonePie = pieMode === "workers" ? [
    { name: "Insulated (E0)", value: workersE0, fill: ZONE_COLORS.E0 },
    { name: "Augmented (E1)", value: workersE1, fill: ZONE_COLORS.E1 },
    { name: "Automated (E2)", value: workersE2, fill: ZONE_COLORS.E2 },
  ] : [
    { name: "Insulated (E0)", value: totalE0, fill: ZONE_COLORS.E0 },
    { name: "Augmented (E1)", value: totalE1, fill: ZONE_COLORS.E1 },
    { name: "Automated (E2)", value: totalE2, fill: ZONE_COLORS.E2 },
  ];

  // Bubble chart data — sector positioning
  const bubbleData = sectors
    .filter((s) => s.total_employment && s.weighted_eloundou_beta != null)
    .map((s) => ({
      name: s.naics_title,
      x: s.weighted_eloundou_beta || 0,
      y: s.total_employment || 0,
      z: s.total_employment ? (s.workers_e2 / s.total_employment) * 100 : 0,
      zone: dominantWorkerZone(s),
      naics_code: s.naics_code,
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header with region toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Industry Sectors</h1>
          <p style={{ fontSize: 14, color: "#71717A", margin: "4px 0 0" }}>
            AI exposure analysis across {data.total_sectors} {region === "AU" ? "ANZSIC" : "NAICS"} sectors
            {" "}· {(totalEmp / 1_000_000).toFixed(1)}M {region === "AU" ? "AU" : "US"} workers
          </p>
        </div>
        <RegionSelector region={region} onChange={setRegion} />
      </div>

      {/* Zone explainer — collapsed by default */}
      <ZoneExplainerPanel />

      {/* Metric cards — workers at risk */}
      <div style={{ display: "flex", gap: 16 }}>
        <MetricCard label="INSULATED (E0)" value={fmtEmp(workersE0)}
          subtitle={`workers in ${totalE0} occupations with Beta < 0.40`} color={ZONE_COLORS.E0} />
        <MetricCard label="AUGMENTED (E1)" value={fmtEmp(workersE1)}
          subtitle={`workers in ${totalE1} occupations with Beta 0.40–0.85`} color={ZONE_COLORS.E1} />
        <MetricCard label="AUTOMATED (E2)" value={fmtEmp(workersE2)}
          subtitle={`workers in ${totalE2} occupations with Beta ≥ 0.85`} color={ZONE_COLORS.E2} />
        <MetricCard label="BELOW THRESHOLD" value={String(drift?.below_threshold || 0)}
          subtitle="Tasks approaching zone flip" color={ZONE_COLORS.alert}
          bgColor={ZONE_BG.alert} borderColor="#FECACA" />
      </div>

      {/* Company lookup — auto-selects sectors */}
      <CompanyLookup
        region={region}
        onSectorsSelected={(codes, name) => {
          // Merge with existing selection, deduplicate
          setSelectedSectors((prev) => [...new Set([...prev, ...codes])]);
          if (name) setCompanyName(name);
        }}
      />

      {/* Composite sector selector */}
      <SectorChipSelector
        sectors={sectors}
        selected={selectedSectors}
        onChange={setSelectedSectors}
        region={region}
        companyName={companyName}
      />

      {/* Charts row */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Zone distribution pie */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Zone Distribution</div>
            <button
              onClick={() => setPieMode(pieMode === "workers" ? "occupations" : "workers")}
              style={{
                fontSize: 11, color: "#2563EB", background: "none", border: "none",
                cursor: "pointer", padding: 0, textDecoration: "underline",
              }}
            >
              {pieMode === "workers" ? "By occupations" : "By workers"}
            </button>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={zonePie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius={60} outerRadius={100} paddingAngle={2}>
                {zonePie.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Legend />
              <Tooltip formatter={(val: number) => pieMode === "workers" ? fmtEmp(val) : val.toLocaleString()} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Sector positioning bubble chart */}
        <div style={{ flex: 2, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Sector Positioning</div>
          <div style={{ fontSize: 12, color: "#71717A", marginBottom: 16 }}>
            Exposure (weighted Beta) vs employment · Bubble size = % workers in E2 zone
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <XAxis type="number" dataKey="x" name="Weighted Beta"
                tick={{ fontSize: 11 }} label={{ value: "Weighted Eloundou Beta", position: "bottom", fontSize: 10, fill: "#A1A1AA" }} />
              <YAxis type="number" dataKey="y" name="Employment"
                tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmtEmp(v)}
                label={{ value: "Employment", angle: -90, position: "insideLeft", fontSize: 10, fill: "#A1A1AA" }} />
              <ZAxis type="number" dataKey="z" range={[40, 400]} name="E2 %" />
              <Tooltip content={<BubbleTooltip />} />
              <Scatter data={bubbleData}>
                {bubbleData.map((d, i) => (
                  <Cell key={i} fill={ZONE_COLORS[d.zone as keyof typeof ZONE_COLORS] || "#94A3B8"}
                    fillOpacity={0.7} stroke={ZONE_COLORS[d.zone as keyof typeof ZONE_COLORS] || "#94A3B8"}
                    strokeWidth={1} cursor="pointer"
                    onClick={() => navigate(`/sectors/${d.naics_code}${region === "AU" ? "?region=AU" : ""}`)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sector table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", overflow: "hidden" }}>
        <div style={{ fontSize: 16, fontWeight: 600, padding: "16px 20px", borderBottom: "1px solid #E4E4E7" }}>
          Sectors by Employment
          <span style={{ fontSize: 12, fontWeight: 400, color: "#A1A1AA", marginLeft: 8 }}>
            Employment-weighted scores
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ backgroundColor: "#F9FAFB" }}>
              <th style={th}>Sector</th>
              <th style={{ ...th, textAlign: "right" }}>Employment</th>
              <th style={{ ...th, textAlign: "right" }}>Eloundou β</th>
              <th style={{ ...th, textAlign: "right" }}>MS AI</th>
              <th style={{ ...th, textAlign: "right" }}>AEI</th>
              <th style={{ ...th, textAlign: "right", color: ZONE_COLORS.E2 }}>E2 Workers</th>
              <th style={{ ...th, textAlign: "center", color: ZONE_COLORS.E0 }}>E0</th>
              <th style={{ ...th, textAlign: "center", color: ZONE_COLORS.E1 }}>E1</th>
              <th style={{ ...th, textAlign: "center", color: ZONE_COLORS.E2 }}>E2</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => (
              <tr key={s.naics_code}
                onClick={() => navigate(`/sectors/${s.naics_code}${region === "AU" ? "?region=AU" : ""}`)}
                style={{ cursor: "pointer", borderTop: "1px solid #E4E4E7" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F9FAFB")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <td style={td}>{s.naics_title}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtEmp(s.total_employment)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(s.weighted_eloundou_beta)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(s.weighted_ms_applicability)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtScore(s.weighted_aei_exposure)}</td>
                <td style={{ ...td, textAlign: "right", color: ZONE_COLORS.E2, fontWeight: 600 }}>
                  {fmtEmp(s.workers_e2)}
                </td>
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

// Custom tooltip for bubble chart
function BubbleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; x: number; y: number; z: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8,
      padding: "8px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
      <div>Weighted Beta: {d.x.toFixed(3)}</div>
      <div>Employment: {fmtEmp(d.y)}</div>
      <div>E2 Workers: {d.z.toFixed(1)}%</div>
    </div>
  );
}

// Determine which zone has the most workers in a sector
function dominantWorkerZone(s: SectorSummary): string {
  if (s.workers_e2 >= s.workers_e1 && s.workers_e2 >= s.workers_e0) return "E2";
  if (s.workers_e1 >= s.workers_e0) return "E1";
  return "E0";
}

// Helpers
const th: React.CSSProperties = { padding: "10px 16px", fontWeight: 600, fontSize: 12, color: "#71717A", letterSpacing: 0.5, textAlign: "left" };
const td: React.CSSProperties = { padding: "10px 16px" };

function fmtEmp(n: number | null): string {
  if (n == null) return "\u2014";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtScore(n: number | null): string {
  return n != null ? n.toFixed(3) : "\u2014";
}
