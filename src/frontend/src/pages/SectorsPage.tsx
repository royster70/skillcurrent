import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { ZONE_COLORS, ZONE_BG, THEME, TYPE } from "../lib/constants";
import { MetricCard } from "../components/MetricCard";
import { CompanyLookup } from "../components/CompanyLookup";
import { SectorChipSelector } from "../components/SectorChipSelector";
import { SectorWaterline } from "../components/SectorWaterline";
import { SectorSignalTable } from "../components/SectorSignalTable";
import { ZoneLegend } from "../components/ZoneExplorer";
import { RegionSelector } from "../components/RegionSelector";

const t = THEME.light;

export function SectorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const region = searchParams.get("region")?.toUpperCase() === "AU" ? "AU" : "US";
  const { data, loading, error } = useApi(() => api.sectors(region), [region]);
  const { data: drift } = useApi(() => api.driftSummary(), []);
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

  // Aggregate occupation counts by zone
  const totalE0 = sectors.reduce((s, x) => s + x.zone_e0_count, 0);
  const totalE1 = sectors.reduce((s, x) => s + x.zone_e1_count, 0);
  const totalE2 = sectors.reduce((s, x) => s + x.zone_e2_count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: TYPE.body, color: t.ink }}>
      {/* Header with region toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
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
        {/* Unlike the three zone cards, this is Rising-Tide vocabulary — so it
            links there (and uses that page's own label, not raw jargon). */}
        <Link to="/tide" title="See these tasks on Rising Tide →" style={{ flex: 1, display: "flex", textDecoration: "none" }}>
          <MetricCard label="AT THE WATERLINE" value={String(drift?.below_threshold || 0)}
            subtitle="the next tasks to flip zones →" color={ZONE_COLORS.alert}
            bgColor={ZONE_BG.alert} borderColor={`${ZONE_COLORS.alert}40`} />
        </Link>
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

      {/* The reference grid — every sector, every signal, as micro-instruments
          (replaces the bare 9-column digits table) */}
      <SectorSignalTable sectors={sectors} region={region} />
    </div>
  );
}

// Helpers
function fmtEmp(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
