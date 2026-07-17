/**
 * BriefPage — one-page printable brief (GitHub #85).
 *
 * A chrome-free view (rendered OUTSIDE <Layout>, so no sidebar prints) that
 * packages what a page already shows into a single sheet you can print or save
 * as PDF — via the browser's own print (window.print + the `@media print`
 * block in index.css), so it needs no PDF library and works in the static build.
 *
 * Faceted by AUDIENCE (#86): the subject is fixed by the route (this occupation
 * or this sector), and the active audience lens decides how it's framed — the
 * OccupationSummaryPanel and SkillsToBuild it composes are already
 * audience-aware, and the brief states the lens it was prepared for. It also
 * inherits the active language mode (#79), print-fixed at open time.
 *
 * All data comes from existing endpoints (api.occupation/taskMatrix/bearings,
 * api.sectorPriorities) — no new backend.
 */

import { useParams, useSearchParams, Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import type { Region } from "../lib/region";
import { THEME, TYPE, ZONE_COLORS } from "../lib/constants";
import { useAudience } from "../lib/audience";
import { OccupationSummaryPanel } from "../components/OccupationSummaryPanel";
import { SkillsToBuild } from "../components/SkillsToBuild";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { RegionBadge } from "../components/RegionBadge";
import { TideChip, ZoneChip } from "../components/OccupationChips";
import { generateNarrative } from "./SectorDetailPage";

const t = THEME.light;

/** dd Mon yyyy — the brief carries the date it was prepared. `new Date()` is
 * available in the browser (the ban is workflow-script only). */
function today(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

/** Shared print scaffold: the "print / save as PDF" control (hidden in print),
 * the SkillCurrent mark, the audience lens, and the sheet the content prints on. */
function BriefSheet({ children }: { children: React.ReactNode }) {
  const { aud } = useAudience();
  return (
    <div style={{ background: t.ground, minHeight: "100vh", padding: "24px 16px", fontFamily: TYPE.body, color: t.ink }}>
      {/* Screen-only toolbar */}
      <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link to="/occupations" style={{ fontSize: 13, color: t.brass, textDecoration: "none", fontWeight: 600 }}>← Back to SkillCurrent</Link>
        <button
          onClick={() => window.print()}
          style={{ padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: t.brass, color: "#fff", cursor: "pointer", fontFamily: TYPE.body }}
        >
          Print / Save as PDF
        </button>
      </div>

      <div
        className="brief-sheet"
        style={{ maxWidth: 820, margin: "0 auto", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      >
        {/* Masthead */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `2px solid ${t.brass}`, paddingBottom: 10, marginBottom: 18 }}>
          <div style={{ fontFamily: TYPE.display, fontSize: 20, fontWeight: 700 }}>
            Skill<span style={{ color: t.brass }}>Current</span>
          </div>
          <div style={{ fontSize: 11, color: t.inkMuted, textAlign: "right" }}>
            Prepared for <strong>{aud.label}</strong> · {today()}
          </div>
        </div>
        {children}
        {/* Footer — provenance + non-claim */}
        <div style={{ fontSize: 10, color: t.inkMuted, marginTop: 22, paddingTop: 12, borderTop: `1px solid ${t.line}`, lineHeight: 1.5 }}>
          Exposure measures what AI could reach, not what happens to jobs. Open, evidence-based intelligence —
          methodology and per-source licences at skillcurrent. Generated from public occupational data.
        </div>
      </div>
    </div>
  );
}

function OccupationBrief({ soc }: { soc: string }) {
  const { data: occ, loading } = useApi(() => api.occupation(soc), [soc]);
  const { data: matrixData } = useApi(() => api.taskMatrix(soc), [soc]);
  const { data: bearings } = useApi(() => api.bearings(soc), [soc]);

  if (loading) return <BriefSheet><div>Loading…</div></BriefSheet>;
  if (!occ) return <BriefSheet><div>Occupation not found.</div></BriefSheet>;

  return (
    <BriefSheet>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: TYPE.display, fontSize: 26, fontWeight: 600, margin: 0 }}>{occ.title}</h1>
        <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: TYPE.mono }}>{occ.soc_code}</span>
          {occ.total_employment != null && <span>· {(occ.total_employment / 1000).toFixed(0)}K workers</span>}
          <RegionBadge region="US" />
          <ZoneChip zone={occ.dominant_zone} />
          <TideChip classification={occ.drift_classification} velocity={occ.drift_velocity} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {matrixData && <OccupationSummaryPanel occ={occ} matrixData={matrixData} bearings={bearings} />}
        <SkillsToBuild bearings={bearings} />
        {occ.signal_coverage && (
          <div style={{ fontSize: 11, color: t.inkMuted }}>
            <ConfidenceBadge coverage={occ.signal_coverage} />
          </div>
        )}
      </div>
    </BriefSheet>
  );
}

function SectorBrief({ code, region }: { code: string; region: Region }) {
  const { data, loading } = useApi(() => api.sectorPriorities(code, 10, region), [code, region]);

  if (loading) return <BriefSheet><div>Loading…</div></BriefSheet>;
  if (!data) return <BriefSheet><div>Sector not found.</div></BriefSheet>;

  const narrative = generateNarrative(data);
  const roles = data.priority_roles.slice(0, 8);

  return (
    <BriefSheet>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: TYPE.display, fontSize: 26, fontWeight: 600, margin: 0 }}>{data.naics_title}</h1>
        <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 3 }}>
          <span style={{ fontFamily: TYPE.mono }}>{data.naics_code}</span> · {data.occupation_count} occupations
          {data.total_employment ? ` · ${(data.total_employment / 1_000_000).toFixed(1)}M workers` : ""}
          {"  "}<RegionBadge region={region} />
        </div>
      </div>

      {narrative.length > 0 && (
        <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
          {narrative.map((s, i) => (
            <span key={i}>{s} </span>
          ))}
        </div>
      )}

      <div style={{ fontFamily: TYPE.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkMuted, marginBottom: 8 }}>
        Priority roles
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}`, textAlign: "left", color: t.inkMuted }}>
            <th style={{ padding: "6px 8px", fontWeight: 600 }}>Occupation</th>
            <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Workers</th>
            <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Zone</th>
            <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Impact</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.soc_code} style={{ borderBottom: `1px solid ${t.line}` }}>
              <td style={{ padding: "6px 8px" }}>{r.occupation_title}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtNum(r.headcount)}</td>
              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                {r.dominant_zone && (
                  <span style={{ fontWeight: 600, color: ZONE_COLORS[r.dominant_zone as keyof typeof ZONE_COLORS] ?? t.inkMuted }}>
                    {r.dominant_zone}
                  </span>
                )}
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>
                {r.impact_score != null ? (r.impact_score * 100).toFixed(0) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </BriefSheet>
  );
}

/** Route entry — picks the brief by its params. */
export function OccupationBriefPage() {
  const { soc } = useParams<{ soc: string }>();
  if (!soc) return null;
  return <OccupationBrief soc={soc} />;
}

export function SectorBriefPage() {
  const { code } = useParams<{ code: string }>();
  const [params] = useSearchParams();
  const region: Region = params.get("region")?.toUpperCase() === "AU" ? "AU" : "US";
  if (!code) return null;
  return <SectorBrief code={code} region={region} />;
}
