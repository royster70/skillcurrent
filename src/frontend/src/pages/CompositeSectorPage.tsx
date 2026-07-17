/**
 * CompositeSectorPage — blended multi-sector impact analysis.
 *
 * Reads ?codes=62,54,51 from URL, fetches composite data, and displays:
 * - Sector chip badges (read-only, zone-coloured)
 * - Employment-weighted metric cards (E0/E1/E2 + composite Beta)
 * - Unified occupation table with multi-sector badges
 * - Auto-generated narrative summary
 */

import { useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import {
  api,
  type CompositeSectorResponse,
  type SubdivisionEntry,
  type SubdivisionOccupationProfile,
} from "../lib/api";
import { ZONE_COLORS, ZONE_BG, THEME, TYPE, BRASS_TINT } from "../lib/constants";
import { useLanguage } from "../lib/language";
import { useRegion, type Region } from "../lib/region";
import { RegionBadge } from "../components/RegionBadge";
import type { Lexicon } from "../lib/lexicon";
import { MetricCard } from "../components/MetricCard";
import { ZoneLegend } from "../components/ZoneExplorer";
import { OccupationMixPanel } from "../components/OccupationMixPanel";
import { InsightCallout } from "../components/InsightCallout";

const t = THEME.light;
// NOTE: the AU-only indigo panels below (CompositeSubdivisions,
// SubdivisionOccupationPanel, ANZSCO_COLORS) and the purple "Weighted Beta"
// metric card keep their existing distinct palettes deliberately — documented
// visual languages (CLAUDE.md), not legacy debt. Only the generic page chrome
// is reskinned to Warm Instrument here.

export function CompositeSectorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const codes = (searchParams.get("codes") || "").split(",").filter(Boolean);
  const { region } = useRegion();
  const company = searchParams.get("company") || undefined;

  const { data, loading, error } = useApi(
    () => codes.length >= 2 ? api.compositeAnalysis(codes, region, company) : Promise.reject("Need 2+ codes"),
    [searchParams.get("codes"), region, company],
  );

  if (codes.length < 2) {
    return (
      <div style={{ padding: 32, fontFamily: TYPE.body, color: t.ink }}>
        <h1 style={{ fontFamily: TYPE.display, fontSize: 28, fontWeight: 600, margin: 0 }}>Composite Sector Analysis</h1>
        <p style={{ color: t.inkMuted, marginTop: 8 }}>
          Select 2 or more sectors from the{" "}
          {/* Router Link (basename-aware), and the chip selector lives on
              /sectors — the old raw <a href="/"> escaped the app on GitHub
              Pages AND pointed at the landing page. */}
          <Link to={region === "AU" ? "/sectors?region=AU" : "/sectors"} style={{ color: t.brass }}>Sectors page</Link>{" "}
          to build a composite view.
        </p>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 32, fontFamily: TYPE.body, color: t.ink }}>Loading composite analysis...</div>;
  if (error) return (
    <div style={{ padding: 32, fontFamily: TYPE.body, color: t.ink }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Composite Sector Analysis</h1>
      <p style={{ color: ZONE_COLORS.alert, marginTop: 8 }}>
        Failed to load composite analysis: {error}
      </p>
      <p style={{ color: t.inkMuted, marginTop: 4, fontSize: 14 }}>
        If the backend was recently updated, try restarting the API server.
        Selected codes: {codes.join(", ")}
      </p>
    </div>
  );
  if (!data) return null;

  return <CompositeContent data={data} navigate={navigate} region={region} />;
}

// ── Main content (separated for cleaner rendering) ──

function CompositeContent({
  data,
  navigate,
  region = "US",
}: {
  data: CompositeSectorResponse;
  navigate: ReturnType<typeof useNavigate>;
  region?: Region;
}) {
  const { mode, lex } = useLanguage();
  const totalEmp = data.total_employment;
  const narrative = generateNarrative(data, lex, mode === "plain");

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
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: TYPE.body, color: t.ink }}>
      {/* Header */}
      <div>
        {data.company_name ? (
          <>
            <h1 style={{ fontFamily: TYPE.display, fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>
              {data.company_name}
            </h1>
            <p style={{ fontSize: 14, color: t.inkMuted, margin: "4px 0 0" }}>
              {data.codes.length} sectors · {fmtEmp(totalEmp)} workers
              · composite AI exposure profile{" "}
              <RegionBadge region={region} />
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: TYPE.display, fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>
              Composite Sector Analysis
            </h1>
            <p style={{ fontSize: 14, color: t.inkMuted, margin: "4px 0 0" }}>
              {data.codes.length} sectors combined · {fmtEmp(totalEmp)} workers
              · employment-weighted exposure profile{" "}
              <RegionBadge region={region} />
            </p>
          </>
        )}
      </div>

      {/* Sector chips (read-only) + back link */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 1,
          color: t.inkMuted, fontFamily: TYPE.mono,
        }}>SECTORS</span>
        {data.sector_names.map((name) => (
          <div
            key={name}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              borderRadius: 99, padding: "6px 12px 6px 8px",
              background: BRASS_TINT,
              border: `1px solid ${t.line}`,
              fontSize: 12, fontWeight: 500,
              color: t.ink,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.brass }} />
            {name}
          </div>
        ))}
        <button
          onClick={() => navigate(`/sectors${region === "AU" ? "?region=AU" : ""}`)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: "pointer",
            padding: "6px 12px", borderRadius: 8,
            fontSize: 12, fontWeight: 500, color: t.inkMuted,
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
          label={mode === "plain" ? lex.zoneLabels.E0.toUpperCase() : `${lex.zoneLabels.E0.toUpperCase()} (E0)`}
          value={fmtEmp(data.workers_e0)}
          subtitle={`${pct(data.workers_e0, totalEmp)} of composite workforce`}
          color={ZONE_COLORS.E0}
        />
        <MetricCard
          label={mode === "plain" ? lex.zoneLabels.E1.toUpperCase() : `${lex.zoneLabels.E1.toUpperCase()} (E1)`}
          value={fmtEmp(data.workers_e1)}
          subtitle={`${pct(data.workers_e1, totalEmp)} of composite workforce`}
          color={ZONE_COLORS.E1}
        />
        <MetricCard
          label={mode === "plain" ? lex.zoneLabels.E2.toUpperCase() : `${lex.zoneLabels.E2.toUpperCase()} (E2)`}
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

      {/* Zone explainer — collapsed by default */}
      <ZoneLegend />

      {/* AU-only: Subdivision breakdown by sector + Occupation mix */}
      {region === "AU" && data.subdivisions && (
        <CompositeSubdivisions
          subdivisions={data.subdivisions}
          sectorNames={Object.fromEntries(data.codes.map((c, i) => [c, data.sector_names[i]]))}
        />
      )}

      {region === "AU" && data.subdivision_occupation_mix && (
        <SubdivisionOccupationPanel
          profiles={data.subdivision_occupation_mix}
          sectorNames={Object.fromEntries(data.codes.map((c, i) => [c, data.sector_names[i]]))}
          companyName={data.company_name}
        />
      )}

      {region === "AU" && data.occupation_mix && (
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <OccupationMixPanel mix={data.occupation_mix} />
          </div>
          <div style={{ flex: 1 }}>
            <InsightCallout title="Blended workforce composition">
              This occupation mix combines Census data across {data.codes.length} ANZSIC divisions.
              {data.company_name
                ? ` For ${data.company_name}, the actual role distribution may differ from national averages based on their specific subdivision focus.`
                : " The actual role distribution for a specific company may differ based on their subdivision focus."}
            </InsightCallout>
          </div>
        </div>
      )}

      {/* Occupation table */}
      <div style={{
        background: t.surface, borderRadius: 12, border: `1.5px solid ${t.line}`, overflow: "hidden",
      }}>
        <div style={{
          fontSize: 16, fontWeight: 600, padding: "16px 20px",
          borderBottom: `1px solid ${t.line}`,
        }}>
          Unified Occupations
          <span style={{ fontSize: 12, fontWeight: 400, color: t.inkMuted, marginLeft: 8 }}>
            De-duplicated across {data.codes.length} sectors · sorted by combined headcount
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ backgroundColor: t.ground }}>
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
                style={{ cursor: "pointer", borderTop: `1px solid ${t.line}` }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.ground)}
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
                  color: occ.dominant_zone ? ZONE_COLORS[occ.dominant_zone as keyof typeof ZONE_COLORS] : t.inkMuted,
                }}>
                  {occ.dominant_zone || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{
          padding: "10px 16px", textAlign: "center",
          borderTop: `1px solid ${t.line}`, fontSize: 13, color: t.inkMuted,
        }}>
          {data.occupation_count} unique occupations across {data.codes.length} sectors
          {data.occupation_count > 50 && " · Showing top 50 by headcount"}
        </div>
      </div>

      {/* Narrative summary — a first-class dark "instrument" card, using the
          same THEME.dark tokens the app-wide dark mode will use. */}
      <div style={{
        background: THEME.dark.surface, borderRadius: 12, padding: "16px 20px",
        border: `1px solid ${THEME.dark.line}`,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: THEME.dark.inkMuted,
          fontFamily: TYPE.mono,
        }}>COMPOSITE INTELLIGENCE SUMMARY</div>
        <div style={{
          fontSize: 12, lineHeight: 1.6, color: THEME.dark.inkMuted,
        }}>
          {narrative}
        </div>
        <div style={{ display: "flex", gap: 16, padding: "8px 0", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: THEME.dark.ink, fontFamily: TYPE.mono }}>
            {fmtEmp(data.total_employment)} workers
          </span>
          <span style={{ color: THEME.dark.inkMuted }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: ZONE_COLORS.E0, fontFamily: TYPE.mono }}>
            {pct(data.workers_e0, data.total_employment)} E0 zone
          </span>
          <span style={{ color: THEME.dark.inkMuted }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: THEME.dark.ink, fontFamily: TYPE.mono }}>
            {data.occupation_count} unique occupations
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Narrative generation ──

function generateNarrative(data: CompositeSectorResponse, lex: Lexicon, plain: boolean): string {
  const names = data.sector_names;
  const nameStr = names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;

  const totalEmp = data.total_employment;
  const beta = data.weighted_eloundou_beta;
  const zone = beta != null
    ? beta >= 0.85
      ? plain ? lex.zoneLabels.E2 : `${lex.zoneLabels.E2} (E2)`
      : beta >= 0.4
        ? plain ? lex.zoneLabels.E1 : `${lex.zoneLabels.E1} (E1)`
        : plain ? lex.zoneLabels.E0 : `${lex.zoneLabels.E0} (E0)`
    : "undetermined";

  // Find occupations that span the most sectors
  const crossSector = data.occupations.filter((o) => o.sectors.length >= names.length);
  const topCross = crossSector.length > 0 ? crossSector[0] : null;

  // Highest-exposure occupation
  const topExposed = [...data.occupations]
    .filter((o) => o.eloundou_beta != null)
    .sort((a, b) => (b.eloundou_beta || 0) - (a.eloundou_beta || 0))[0];

  let narrative = data.company_name
    ? `${data.company_name} operates across ${nameStr} — representing ${fmtEmp(totalEmp)} workers in the combined national workforce.`
    : `This composite spans ${nameStr} — representing ${fmtEmp(totalEmp)} workers.`;

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

// ── AU Subdivision breakdown per sector ──

function CompositeSubdivisions({
  subdivisions,
  sectorNames,
}: {
  subdivisions: Record<string, SubdivisionEntry[]>;
  sectorNames: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const codes = Object.keys(subdivisions);

  return (
    <div style={{
      background: t.surface, borderRadius: 12, border: "1.5px solid #E0E7FF",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 20px", borderBottom: "1px solid #E0E7FF",
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#312E81" }}>
            Sub-sector Breakdown
          </div>
          <div style={{ fontSize: 12, color: "#6366F1", marginTop: 2 }}>
            ANZSIC subdivisions within each division — employment from JSA 2025
          </div>
        </div>
        <button
          onClick={() => {
            if (expanded.size === codes.length) {
              setExpanded(new Set());
            } else {
              setExpanded(new Set(codes));
            }
          }}
          style={{
            background: "none", border: "1px solid #C7D2FE", borderRadius: 6,
            padding: "4px 10px", fontSize: 11, cursor: "pointer",
            color: "#4F46E5", fontWeight: 500,
          }}
        >
          {expanded.size === codes.length ? "Collapse all" : "Expand all"}
        </button>
      </div>
      {codes.map((code) => {
        const subs = subdivisions[code];
        const isOpen = expanded.has(code);
        const maxEmp = Math.max(...subs.map(s => s.employment ?? 0));
        return (
          <div key={code} style={{ borderTop: "1px solid #EEF2FF" }}>
            <button
              onClick={() => {
                const next = new Set(expanded);
                if (next.has(code)) next.delete(code); else next.add(code);
                setExpanded(next);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "10px 20px", background: "none", border: "none",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                stroke="#6366F1" strokeWidth={2.5} strokeLinecap="round"
                style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#312E81" }}>
                {code}
              </span>
              <span style={{ fontSize: 13, color: "#4B5563" }}>
                {sectorNames[code] || code}
              </span>
              <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>
                {subs.length} subdivisions
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 20px 12px 40px", display: "flex", flexDirection: "column", gap: 4 }}>
                {subs.map((sub) => (
                  <div key={sub.subdivision_name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      height: 6, borderRadius: 3, background: "#818CF8",
                      width: `${Math.max(4, (sub.employment ?? 0) / maxEmp * 140)}px`,
                      transition: "width 0.2s",
                    }} />
                    <span style={{ fontSize: 12, color: "#374151", minWidth: 0, flex: 1 }}>
                      {sub.subdivision_name}
                    </span>
                    <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                      {sub.employment ? `${(sub.employment / 1000).toFixed(0)}K` : "—"}
                    </span>
                    <span style={{ fontSize: 10, color: "#6366F1", width: 40, textAlign: "right" }}>
                      {sub.share_pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Subdivision Occupation Profiles ──

const ANZSCO_COLORS: Record<number, string> = {
  1: "#6366F1", // Managers — indigo
  2: "#2563EB", // Professionals — blue
  3: "#0891B2", // Technicians — cyan
  4: "#059669", // Community & Personal — emerald
  5: "#CA8A04", // Clerical — yellow
  6: "#EA580C", // Sales — orange
  7: "#7C3AED", // Machinery Operators — violet
  8: "#DC2626", // Labourers — red
};

function SubdivisionOccupationPanel({
  profiles,
  sectorNames,
  companyName,
}: {
  profiles: SubdivisionOccupationProfile[];
  sectorNames: Record<string, string>;
  companyName: string | null;
}) {
  const [expandedDivs, setExpandedDivs] = useState<Set<string>>(new Set());

  // Group profiles by division
  const byDivision = useMemo(() => {
    const map: Record<string, SubdivisionOccupationProfile[]> = {};
    for (const p of profiles) {
      if (!map[p.anzsic_division_code]) map[p.anzsic_division_code] = [];
      map[p.anzsic_division_code].push(p);
    }
    return map;
  }, [profiles]);

  const divCodes = Object.keys(byDivision).sort();

  return (
    <div style={{
      background: t.surface, borderRadius: 12, border: "1.5px solid #E0E7FF",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 20px", borderBottom: "1px solid #E0E7FF",
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#312E81" }}>
            Subdivision Occupation Profiles
          </div>
          <div style={{ fontSize: 12, color: "#6366F1", marginTop: 2 }}>
            How occupations differ across ANZSIC subdivisions — ABS Census 2021
            {companyName && ` · ${companyName}`}
          </div>
        </div>
        <button
          onClick={() => {
            if (expandedDivs.size === divCodes.length) {
              setExpandedDivs(new Set());
            } else {
              setExpandedDivs(new Set(divCodes));
            }
          }}
          style={{
            background: "none", border: "1px solid #C7D2FE", borderRadius: 6,
            padding: "4px 10px", fontSize: 11, cursor: "pointer",
            color: "#4F46E5", fontWeight: 500,
          }}
        >
          {expandedDivs.size === divCodes.length ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {divCodes.map((divCode) => {
        const divProfiles = byDivision[divCode];
        const isOpen = expandedDivs.has(divCode);
        const divTotal = divProfiles.reduce((s, p) => s + p.total_employed, 0);

        return (
          <div key={divCode} style={{ borderTop: "1px solid #EEF2FF" }}>
            <button
              onClick={() => {
                const next = new Set(expandedDivs);
                if (next.has(divCode)) next.delete(divCode); else next.add(divCode);
                setExpandedDivs(next);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "10px 20px", background: "none", border: "none",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                stroke="#6366F1" strokeWidth={2.5} strokeLinecap="round"
                style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#312E81" }}>
                {divCode}
              </span>
              <span style={{ fontSize: 13, color: "#4B5563" }}>
                {sectorNames[divCode] || divCode}
              </span>
              <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>
                {divProfiles.length} subdivisions · {fmtEmp(divTotal)} workers
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 20px 16px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
                {divProfiles.map((profile) => (
                  <SubdivisionOccRow key={profile.indp_name} profile={profile} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SubdivisionOccRow({ profile }: { profile: SubdivisionOccupationProfile }) {
  const maxCount = Math.max(...profile.occupations.map((o) => o.employed_count));

  return (
    <div style={{
      background: "#FAFAFE", borderRadius: 8, padding: "10px 14px",
      border: "1px solid #E0E7FF",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1E1B4B" }}>
          {profile.indp_name}
        </span>
        <span style={{ fontSize: 11, color: "#6B7280" }}>
          {fmtEmp(profile.total_employed)} employed
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {profile.occupations.slice(0, 6).map((occ) => (
          <div key={occ.anzsco_major_group} style={{
            display: "flex", alignItems: "center", gap: 8, height: 18,
          }}>
            <span style={{
              fontSize: 10, color: "#6B7280", width: 140, flexShrink: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {occ.major_group_name}
            </span>
            <div style={{
              height: 8, borderRadius: 4, flexShrink: 0,
              background: ANZSCO_COLORS[occ.anzsco_major_group] || "#94A3B8",
              width: `${Math.max(4, (occ.employed_count / maxCount) * 120)}px`,
              transition: "width 0.2s",
            }} />
            <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap" }}>
              {occ.share_pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Style + helpers ──

const th: React.CSSProperties = {
  padding: "10px 16px", fontWeight: 600, fontSize: 12,
  color: t.inkMuted, letterSpacing: 0.5, textAlign: "left",
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
