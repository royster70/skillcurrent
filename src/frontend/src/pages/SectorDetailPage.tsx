import { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { useApi } from "../hooks/useApi";
import { api, type PriorityRole, type SectorSummary } from "../lib/api";
import { ZONE_COLORS, ZONE_BG, CLASSIFICATION_COLORS, GDPVAL_COLORS, SIGNAL_COLORS, THEME, TYPE, BRASS_TINT } from "../lib/constants";
import { ContextualScoreCard } from "../components/ContextualScoreCard";
import { ZoneLegend } from "../components/ZoneExplorer";
import { SubdivisionBarPanel } from "../components/SubdivisionBarPanel";
import { OccupationMixPanel } from "../components/OccupationMixPanel";
import { InsightCallout } from "../components/InsightCallout";

const t = THEME.light;

export function SectorDetailPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const region = searchParams.get("region")?.toUpperCase() === "AU" ? "AU" : "US";
  const navigate = useNavigate();
  const [showFullMix, setShowFullMix] = useState(false);
  const [gdpvalFilter, setGdpvalFilter] = useState(false);
  const [subsExpanded, setSubsExpanded] = useState(false);

  const { data, loading, error } = useApi(
    () => api.sectorPriorities(code!, 10, region), [code, region]
  );
  // Fetch all sectors for percentile ranking
  const { data: allSectorsData } = useApi(() => api.sectors(region), [region]);
  // Fetch GDPval summary for benchmark coverage indicators
  const { data: gdpvalData } = useApi(() => api.gdpvalSummary(), []);

  // Compute sector-level percentiles from all sectors (must be before early returns — Rules of Hooks)
  const sectorContext = useMemo(() => {
    if (!allSectorsData || !code) return null;
    const sectors = allSectorsData.sectors;
    const current = sectors.find((s) => s.naics_code === code);
    if (!current) return null;
    return {
      current,
      eloundou: computePercentile(sectors, current, (s) => s.weighted_eloundou_beta),
      microsoft: computePercentile(sectors, current, (s) => s.weighted_ms_applicability),
      aei: computePercentile(sectors, current, (s) => s.weighted_aei_exposure),
    };
  }, [allSectorsData, code]);

  // GDPval SOC lookup set — must be before early returns (Rules of Hooks)
  // Include both 8-digit (15-1252.00) and 7-digit (15-1252) forms for cross-dataset matching
  const gdpvalSocs = useMemo(() => {
    if (!gdpvalData) return new Set<string>();
    const set = new Set<string>();
    gdpvalData.occupations.forEach((o) => {
      set.add(o.soc_code);
      set.add(o.soc_code.replace(/\.00$/, ""));
    });
    return set;
  }, [gdpvalData]);

  if (loading) return <div>Loading sector...</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;
  if (!data || !code) return null;

  const baseRoles = showFullMix ? data.full_mix : data.priority_roles;
  const displayRoles = gdpvalFilter ? baseRoles.filter((r) => gdpvalSocs.has(r.soc_code)) : baseRoles;

  // Impact score chart for priority roles — include headcount label
  const impactBars = data.priority_roles.map((r) => ({
    name: r.occupation_title.length > 28 ? r.occupation_title.slice(0, 28) + "..." : r.occupation_title,
    impact: (r.impact_score || 0) * 100,
    zone: r.dominant_zone,
    headcount: r.headcount,
    label: `${((r.impact_score || 0) * 100).toFixed(0)} · ${fmtNum(r.headcount)}`,
  }));

  // Three-tier comparison for priority roles
  const threeScores = data.priority_roles.slice(0, 8).map((r) => ({
    name: r.occupation_title.length > 22 ? r.occupation_title.slice(0, 22) + "..." : r.occupation_title,
    Eloundou: r.eloundou_beta || 0,
    Microsoft: r.ms_ai_applicability || 0,
    AEI: r.aei_exposure || 0,
  }));

  // Narrative summary
  const narrative = generateNarrative(data);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: TYPE.body, color: t.ink }}>
      {/* Header */}
      <div>
        <button onClick={() => navigate(`/${region === "AU" ? "?region=AU" : ""}`)}
          style={{ fontSize: 13, color: t.brass, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}>
          ← Back to Sectors
        </button>
        <h1 style={{ fontFamily: TYPE.display, fontSize: 28, fontWeight: 600, margin: 0 }}>{data.naics_title}</h1>
        <p style={{ fontSize: 14, color: t.inkMuted, margin: "4px 0 0" }}>
          {region === "AU" ? "ANZSIC" : "NAICS"} {data.naics_code} · {data.occupation_count} occupations
          {data.total_employment ? ` · ${(data.total_employment / 1_000_000).toFixed(1)}M ${region === "AU" ? "AU" : "US"} workers` : ""}
        </p>
      </div>

      {/* Narrative summary */}
      {narrative.length > 0 && (
        <div style={{
          background: BRASS_TINT, borderRadius: 12, border: `1.5px solid ${t.line}`,
          padding: "14px 20px", lineHeight: 1.6, fontSize: 13, color: t.ink,
        }}>
          {narrative.map((sentence, i) => (
            <span key={i}>{sentence}{i < narrative.length - 1 ? " " : ""}</span>
          ))}
        </div>
      )}

      {/* Sector-level score cards — predicted vs measured with percentile context */}
      {sectorContext && (
        <div style={{ display: "flex", gap: 12 }}>
          <ContextualScoreCard
            label="Eloundou"
            value={sectorContext.current.weighted_eloundou_beta}
            percentile={sectorContext.eloundou.percentile}
            median={sectorContext.eloundou.median}
            population={sectorContext.eloundou.population}
            signalColor={SIGNAL_COLORS.eloundou}
            sourceKey="eloundou"
          />
          <ContextualScoreCard
            label="Microsoft"
            value={sectorContext.current.weighted_ms_applicability}
            percentile={sectorContext.microsoft.percentile}
            median={sectorContext.microsoft.median}
            population={sectorContext.microsoft.population}
            signalColor={SIGNAL_COLORS.microsoft}
            sourceKey="microsoft"
          />
          <ContextualScoreCard
            label="AEI"
            value={sectorContext.current.weighted_aei_exposure}
            percentile={sectorContext.aei.percentile}
            median={sectorContext.aei.median}
            population={sectorContext.aei.population}
            signalColor={SIGNAL_COLORS.aei}
            sourceKey="aei"
          />
        </div>
      )}

      {/* Zone explainer — collapsed by default */}
      <ZoneLegend />

      {/* AU-only panels: Subdivision breakdown + Occupation mix + Insight */}
      {region === "AU" && code && (
        <>
          <SubdivisionBarPanel
            sectorCode={code}
            expanded={subsExpanded}
            onToggle={() => setSubsExpanded(!subsExpanded)}
          />
          {sectorContext?.current?.occupation_mix && (
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <OccupationMixPanel mix={sectorContext.current.occupation_mix} />
              </div>
              <div style={{ flex: 1 }}>
                <InsightCallout title="Sub-sectors shape the role mix">
                  Different ANZSIC subdivisions within this sector employ distinct occupation profiles.
                  Expand the sub-sector breakdown above to see which activities drive employment,
                  then compare with the workforce composition to understand where AI exposure concentrates.
                </InsightCallout>
              </div>
            </div>
          )}
        </>
      )}

      {/* Charts row */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Priority impact scores with headcount labels */}
        <div style={{ flex: 1, background: t.surface, borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Priority Roles — Impact Score</div>
          <div style={{ fontSize: 12, color: t.inkMuted, marginBottom: 16 }}>
            Composite of AI exposure, headcount, concentration, and drift · Label shows score · headcount
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={impactBars} layout="vertical" margin={{ right: 80 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(val: number) => [`${val.toFixed(1)}`, "Impact Score"]} />
              <Bar dataKey="impact" barSize={14} radius={[0, 4, 4, 0]}>
                {impactBars.map((d, i) => (
                  <Cell key={i} fill={
                    d.zone === "E2" ? ZONE_COLORS.E2 :
                    d.zone === "E1" ? ZONE_COLORS.E1 :
                    d.zone === "E0" ? ZONE_COLORS.E0 : t.inkMuted
                  } />
                ))}
                <LabelList dataKey="label" position="right" style={{ fontSize: 10, fill: t.inkMuted }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Three-tier comparison */}
        <div style={{ flex: 1, background: t.surface, borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Three-Tier Evidence Comparison</div>
          <div style={{ fontSize: 12, color: t.inkMuted, marginBottom: 16 }}>
            Theoretical (Eloundou, 0–1.5) vs empirical (Microsoft 0–0.5, AEI) for priority roles
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={threeScores} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="Eloundou" fill={SIGNAL_COLORS.eloundou} barSize={6} radius={[0, 3, 3, 0]} />
              <Bar dataKey="Microsoft" fill={SIGNAL_COLORS.microsoft} barSize={6} radius={[0, 3, 3, 0]} />
              <Bar dataKey="AEI" fill={SIGNAL_COLORS.aei} barSize={6} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Role table */}
      <div style={{ background: t.surface, borderRadius: 12, border: "1.5px solid #E4E4E7", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E4E4E7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {showFullMix ? "All Occupations" : "Priority Roles"}
            </span>
            <span style={{ fontSize: 13, color: t.inkMuted, marginLeft: 8 }}>
              {gdpvalFilter
                ? `${displayRoles.length} with GDPval benchmarks`
                : showFullMix ? `${data.full_mix.length} occupations` : `Top ${data.priority_roles.length} by impact`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setGdpvalFilter(!gdpvalFilter); if (!showFullMix) setShowFullMix(true); }}
              style={{
                fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8,
                border: gdpvalFilter ? `1px solid ${GDPVAL_COLORS.primary}` : "1px solid #E4E4E7",
                backgroundColor: gdpvalFilter ? GDPVAL_COLORS.bg : t.surface, cursor: "pointer",
                color: gdpvalFilter ? GDPVAL_COLORS.primary : t.inkMuted,
              }}
            >
              GDPval Only ({gdpvalSocs.size > 0 ? data.full_mix.filter((r) => gdpvalSocs.has(r.soc_code)).length : "..."})
            </button>
            <button
              onClick={() => setShowFullMix(!showFullMix)}
              style={{
                fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 8,
                border: "1px solid #E4E4E7", backgroundColor: t.surface, cursor: "pointer",
                color: t.brass,
              }}
            >
              {showFullMix ? "Show Priority Only" : `Show All ${data.occupation_count} Roles`}
            </button>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: t.ground }}>
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
              <RoleRow key={r.soc_code} role={r} navigate={navigate} hasGdpval={gdpvalSocs.has(r.soc_code)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Generate 2-3 narrative sentences from sector data. */
function generateNarrative(data: {
  naics_title: string;
  total_employment: number | null;
  occupation_count: number;
  priority_roles: PriorityRole[];
  full_mix: PriorityRole[];
}): string[] {
  const sentences: string[] = [];
  const all = data.full_mix.length > 0 ? data.full_mix : data.priority_roles;

  // Zone breakdown
  const e2Roles = all.filter((r) => r.dominant_zone === "E2");
  const e2Workers = e2Roles.reduce((s, r) => s + (r.headcount || 0), 0);
  const totalWorkers = all.reduce((s, r) => s + (r.headcount || 0), 0);
  if (e2Roles.length > 0 && totalWorkers > 0) {
    const pct = ((e2Workers / totalWorkers) * 100).toFixed(0);
    sentences.push(
      `${e2Roles.length} of ${all.length} occupations are in the automated zone (E2), representing ${fmtNum(e2Workers)} workers (${pct}% of this sector's workforce).`
    );
  }

  // Top priority role
  if (data.priority_roles.length > 0) {
    const top = data.priority_roles[0];
    sentences.push(
      `The highest-priority role is ${top.occupation_title}, employing ${fmtNum(top.headcount)} workers with an impact score of ${((top.impact_score || 0) * 100).toFixed(0)}.`
    );
  }

  // Drift summary
  const departing = all.filter((r) => r.drift_classification === "departing");
  if (departing.length > 0) {
    sentences.push(
      `${departing.length} role${departing.length > 1 ? "s" : ""} show${departing.length === 1 ? "s" : ""} departing drift \u2014 AI capability for their tasks is growing across model generations.`
    );
  }

  return sentences;
}

function RoleRow({ role: r, navigate, hasGdpval }: { role: PriorityRole; navigate: ReturnType<typeof useNavigate>; hasGdpval?: boolean }) {
  const zoneColor = r.dominant_zone ? ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] : t.inkMuted;
  const driftColor = r.drift_classification ? CLASSIFICATION_COLORS[r.drift_classification as keyof typeof CLASSIFICATION_COLORS] : t.inkMuted;

  return (
    <tr style={{ borderTop: "1px solid #E4E4E7", cursor: "pointer" }}
      onClick={() => navigate(`/occupations?selected=${r.soc_code}`)}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.ground)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <td style={td}>
        <div style={{ fontWeight: 500 }}>{r.occupation_title}</div>
        <div style={{ fontSize: 11, color: t.inkMuted, display: "flex", alignItems: "center", gap: 6 }}>
          {r.soc_code}
          {hasGdpval && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
              backgroundColor: GDPVAL_COLORS.bg, color: GDPVAL_COLORS.primary,
              border: `1px solid ${GDPVAL_COLORS.border}40`,
            }}>
              GDPval
            </span>
          )}
        </div>
      </td>
      <td style={{ ...td, textAlign: "right" }}>{fmtNum(r.headcount)}</td>
      <td style={{ ...td, textAlign: "right", fontWeight: r.location_quotient && r.location_quotient > 2 ? 600 : 400, color: r.location_quotient && r.location_quotient > 2 ? ZONE_COLORS.alert : t.ink }}>
        {r.location_quotient?.toFixed(1) || "\u2014"}
      </td>
      <td style={{ ...td, textAlign: "right" }}>{r.eloundou_beta?.toFixed(2) || "\u2014"}</td>
      <td style={{ ...td, textAlign: "right" }}>{r.ms_ai_applicability?.toFixed(2) || "\u2014"}</td>
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
            {r.drift_classification === "departing" ? "\u2191" : r.drift_classification === "enduring" ? "\u2192" : "\u26A0"}
          </span>
        )}
      </td>
      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
        {r.impact_score != null ? (r.impact_score * 100).toFixed(0) : "\u2014"}
      </td>
      <td style={td}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {r.risk_factors.map((f, i) => (
            <span key={i} style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 4,
              backgroundColor: ZONE_BG.alert, color: ZONE_COLORS.alert,
            }}>
              {f}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: 11, color: t.inkMuted, textAlign: "left", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "10px 12px" };

function fmtNum(n: number | null): string {
  if (n == null) return "\u2014";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Compute percentile rank of a sector within all sectors for a given score accessor. */
function computePercentile(
  sectors: SectorSummary[],
  current: SectorSummary,
  accessor: (s: SectorSummary) => number | null,
): { percentile: number | null; median: number | null; population: number } {
  const values = sectors
    .map(accessor)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  const currentVal = accessor(current);
  if (currentVal == null || values.length === 0) {
    return { percentile: null, median: null, population: values.length };
  }

  // Percentile: % of values below current
  const below = values.filter((v) => v < currentVal).length;
  const percentile = Math.round((below / values.length) * 100);

  // Median
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 === 0
    ? (values[mid - 1] + values[mid]) / 2
    : values[mid];

  return { percentile, median, population: values.length };
}
