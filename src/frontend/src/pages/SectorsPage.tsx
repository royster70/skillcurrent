import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { ZONE_COLORS, ZONE_BG, THEME, TYPE } from "../lib/constants";
import { MetricCard } from "../components/MetricCard";
import { CompanyLookup } from "../components/CompanyLookup";
import { SectorChipSelector } from "../components/SectorChipSelector";
import { SectorWaterline } from "../components/SectorWaterline";
import { ZoneLegend } from "../components/ZoneExplorer";
import { RegionSelector } from "../components/RegionSelector";

const t = THEME.light;

export function SectorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const region = searchParams.get("region")?.toUpperCase() === "AU" ? "AU" : "US";
  const { data, loading, error } = useApi(() => api.sectors(region), [region]);
  const { data: drift } = useApi(() => api.driftSummary(), []);
  const navigate = useNavigate();
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: TYPE.body, color: t.ink }}>
      {/* Header with region toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: TYPE.display, fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Industry Sectors</h1>
          <p style={{ fontSize: 14, color: t.inkMuted, margin: "4px 0 0" }}>
            AI exposure analysis across {data.total_sectors} {region === "AU" ? "ANZSIC" : "NAICS"} sectors
            {" "}· {(totalEmp / 1_000_000).toFixed(1)}M {region === "AU" ? "AU" : "US"} workers
          </p>
        </div>
        <RegionSelector region={region} onChange={setRegion} />
      </div>

      {/* Zone explainer — collapsed by default */}
      <ZoneLegend />

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
          bgColor={ZONE_BG.alert} borderColor={`${ZONE_COLORS.alert}40`} />
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

      {/* Sector waterline — every sector's workforce on the shared exposure
          scale (replaces the zone pie + positioning scatter) */}
      <SectorWaterline sectors={sectors} region={region} />


      {/* Sector table */}
      <div style={{ background: t.surface, borderRadius: 12, border: "1.5px solid #E4E4E7", overflow: "hidden" }}>
        <div style={{ fontSize: 16, fontWeight: 600, padding: "16px 20px", borderBottom: "1px solid #E4E4E7" }}>
          Sectors by Employment
          <span style={{ fontSize: 12, fontWeight: 400, color: t.inkMuted, marginLeft: 8 }}>
            Employment-weighted scores
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ backgroundColor: t.ground }}>
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
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.ground)}
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

// Helpers
const th: React.CSSProperties = { padding: "10px 16px", fontWeight: 600, fontSize: 12, color: t.inkMuted, letterSpacing: 0.5, textAlign: "left" };
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
