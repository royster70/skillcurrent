import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useApi } from "../hooks/useApi";
import { api, IS_STATIC, type GDPvalTaskDetail } from "../lib/api";
import { similarOccupations, type SimilarOccupation } from "../lib/clientSearch";
import { ZONE_COLORS, ZONE_BG, ZONE_LABELS, SIGNAL_COLORS, THEME, TYPE, BRASS_TINT, BETA_SCALE, ZONE_THRESHOLDS } from "../lib/constants";
import { TaskWaterline } from "../components/TaskMatrix";
import { BearingsPanel } from "../components/BearingsPanel";
import { ContextualScoreCard } from "../components/ContextualScoreCard";
import { GDPvalBenchmarkPanel } from "../components/GDPvalBenchmarkPanel";
import { AEITaskDetailPanel } from "../components/AEITaskDetailPanel";
import { GDPVAL_COLORS } from "../lib/constants";

const theme = THEME.light;

type ZoneKey = "E0" | "E1" | "E2";

function zoneOf(beta: number): ZoneKey {
  if (beta >= ZONE_THRESHOLDS.E2) return "E2";
  if (beta >= ZONE_THRESHOLDS.E1) return "E1";
  return "E0";
}

const pctOfScale = (v: number) => Math.max(0, Math.min(100, (v / BETA_SCALE.max) * 100));

/** A slim banded β track with one dot — the hierarchy rail reads on the same
 * scale as every waterline in the app, instead of quoting β as bare text. */
function MiniBetaTrack({ beta, width = 64 }: { beta: number; width?: number }) {
  const e1 = pctOfScale(ZONE_THRESHOLDS.E1);
  const e2 = pctOfScale(ZONE_THRESHOLDS.E2);
  const zone = zoneOf(beta);
  return (
    <span style={{ position: "relative", width, height: 8, borderRadius: 4, display: "inline-flex", flexShrink: 0, overflow: "visible", border: `1px solid ${theme.line}` }}>
      <span style={{ width: `${e1}%`, background: ZONE_BG.E0, borderRadius: "3px 0 0 3px" }} />
      <span style={{ width: `${e2 - e1}%`, background: ZONE_BG.E1 }} />
      <span style={{ width: `${100 - e2}%`, background: ZONE_BG.E2, borderRadius: "0 3px 3px 0" }} />
      <span
        style={{
          position: "absolute", left: `${pctOfScale(beta)}%`, top: "50%",
          width: 9, height: 9, borderRadius: "50%",
          background: ZONE_COLORS[zone], border: `1.5px solid ${theme.surface}`,
          transform: "translate(-50%, -50%)",
        }}
      />
    </span>
  );
}

export function OccupationsPage() {
  const { data: hierarchy, loading } = useApi(() => api.hierarchy(), []);
  const { data: gdpvalData } = useApi(() => api.gdpvalSummary(), []);
  const [searchParams] = useSearchParams();
  const initialSoc = searchParams.get("selected");
  const [selectedSoc, setSelectedSoc] = useState<string | null>(initialSoc);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [gdpvalFilter, setGdpvalFilter] = useState(false);

  // GDPval SOC lookup — both 8-digit and 7-digit forms
  const gdpvalSocs = useMemo(() => {
    if (!gdpvalData) return new Set<string>();
    const set = new Set<string>();
    gdpvalData.occupations.forEach((o) => {
      set.add(o.soc_code);
      set.add(o.soc_code.replace(/\.00$/, ""));
    });
    return set;
  }, [gdpvalData]);

  // Auto-expand the major group containing the selected occupation
  useEffect(() => {
    if (initialSoc && hierarchy) {
      const majorCode = initialSoc.substring(0, 2) + "-0000";
      setSelectedSoc(initialSoc);
      setExpandedGroup(majorCode);
    }
  }, [initialSoc, hierarchy]);

  if (loading) return <div>Loading occupations...</div>;
  if (!hierarchy) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, fontFamily: TYPE.body, color: theme.ink }}>
      {/* Hierarchy panel — wraps above the detail on narrow viewports */}
      <div style={{ flex: "1 1 340px", maxWidth: 480, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: TYPE.display, fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Occupations</h1>
            <p style={{ fontSize: 14, color: theme.inkMuted, margin: "4px 0 0" }}>
              {gdpvalFilter
                ? `${gdpvalSocs.size / 2} occupations with GDPval benchmarks`
                : `${hierarchy.total_occupations.toLocaleString()} occupations across ${hierarchy.total_major_groups} groups`}
            </p>
          </div>
          <button
            onClick={() => setGdpvalFilter(!gdpvalFilter)}
            style={{
              fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, marginBottom: 2,
              border: gdpvalFilter ? `1px solid ${GDPVAL_COLORS.primary}` : `1px solid ${theme.line}`,
              backgroundColor: gdpvalFilter ? GDPVAL_COLORS.bg : theme.surface, cursor: "pointer",
              color: gdpvalFilter ? GDPVAL_COLORS.primary : theme.inkMuted,
            }}
          >
            GDPval
          </button>
        </div>

        <div style={{
          background: theme.surface, borderRadius: 12, border: `1.5px solid ${theme.line}`,
          overflow: "auto", maxHeight: "calc(100vh - 200px)",
        }}>
          {hierarchy.hierarchy.filter((group) =>
            !gdpvalFilter || group.children.some((occ) => gdpvalSocs.has(occ.code))
          ).map((group) => (
            <div key={group.code}>
              <div
                onClick={() => setExpandedGroup(expandedGroup === group.code ? null : group.code)}
                style={{
                  padding: "10px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between",
                  alignItems: "center", borderBottom: `1px solid ${theme.line}`,
                  backgroundColor: expandedGroup === group.code ? BRASS_TINT : "transparent",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{group.title}</div>
                  <div style={{ fontSize: 12, color: theme.inkMuted }}>
                    {gdpvalFilter
                      ? `${group.children.filter((o) => gdpvalSocs.has(o.code)).length} with GDPval`
                      : `${group.occupation_count} occupations`}
                    {!gdpvalFilter && group.total_employment ? ` · ${(group.total_employment / 1_000_000).toFixed(1)}M workers` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {group.avg_eloundou_beta != null && (
                    <>
                      <MiniBetaTrack beta={group.avg_eloundou_beta} />
                      <span style={{
                        fontFamily: TYPE.mono, fontSize: 11.5, fontWeight: 600, width: 30, textAlign: "right",
                        color: ZONE_COLORS[zoneOf(group.avg_eloundou_beta)],
                      }}>
                        {group.avg_eloundou_beta.toFixed(2)}
                      </span>
                    </>
                  )}
                  <span style={{ fontSize: 14, color: theme.inkMuted }}>{expandedGroup === group.code ? "▼" : "▶"}</span>
                </div>
              </div>

              {expandedGroup === group.code && group.children.filter((occ) =>
                !gdpvalFilter || gdpvalSocs.has(occ.code)
              ).map((occ) => (
                <div
                  key={occ.code}
                  onClick={() => setSelectedSoc(occ.code)}
                  style={{
                    padding: "8px 16px 8px 32px", cursor: "pointer",
                    borderBottom: `1px solid ${theme.line}`,
                    backgroundColor: selectedSoc === occ.code ? BRASS_TINT : "transparent",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{occ.title}</div>
                    <div style={{ fontSize: 11, color: theme.inkMuted }}>{occ.code}</div>
                  </div>
                  {occ.avg_eloundou_beta != null && (
                    <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <MiniBetaTrack beta={occ.avg_eloundou_beta} />
                      <span style={{
                        fontFamily: TYPE.mono, fontSize: 11, fontWeight: 600, width: 30, textAlign: "right",
                        color: ZONE_COLORS[zoneOf(occ.avg_eloundou_beta)],
                      }}>
                        {occ.avg_eloundou_beta.toFixed(2)}
                      </span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: "1 1 360px", minWidth: 0 }}>
        {selectedSoc ? (
          <OccupationDetailPanel soc={selectedSoc} />
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", minHeight: 320, textAlign: "center", padding: 24,
          }}>
            <div style={{ fontFamily: TYPE.display, fontSize: 22, fontWeight: 600, color: theme.ink }}>
              The live per-task reading
            </div>
            <p style={{ fontSize: 13.5, color: theme.inkMuted, lineHeight: 1.6, maxWidth: 400, margin: "10px 0 0" }}>
              Pick an occupation family on the left, then a role — every one of its
              tasks is placed on the same dry→submerged scale the whole platform reads on,
              with the current marking where AI usage is rising.
            </p>
            <a href="/#read-the-scale" style={{ fontSize: 12.5, fontWeight: 600, color: theme.brass, textDecoration: "none", marginTop: 12 }}>
              Learn to read the scale →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function OccupationDetailPanel({ soc }: { soc: string }) {
  const { data: occ, loading } = useApi(() => api.occupation(soc), [soc]);
  const { data: matrixData } = useApi(() => api.taskMatrix(soc), [soc]);
  const [gdpvalExpanded, setGdpvalExpanded] = useState(false);
  const [aeiExpanded, setAeiExpanded] = useState(false);
  const [gdpvalTasks, setGdpvalTasks] = useState<GDPvalTaskDetail[] | null>(null);

  // Reset GDPval overlay tasks when occupation changes
  useEffect(() => { setGdpvalTasks(null); }, [soc]);

  const loadGdpvalTasks = useCallback(async () => {
    if (gdpvalTasks) return; // already loaded
    try {
      const resp = await api.gdpvalOccupation(soc);
      setGdpvalTasks(resp.tasks);
    } catch { /* silently ignore — overlay will show loading state */ }
  }, [soc, gdpvalTasks]);

  if (loading) return <div>Loading...</div>;
  if (!occ) return null;

  const zoneColor = occ.dominant_zone ? ZONE_COLORS[occ.dominant_zone as keyof typeof ZONE_COLORS] : theme.inkMuted;

  // Sector breakdown for lower section
  const sectorData = (occ.top_sectors || []).slice(0, 6).map((s) => ({
    name: s.naics_title.length > 25 ? s.naics_title.slice(0, 25) + "..." : s.naics_title,
    headcount: (s.headcount || 0) / 1000,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header — compact */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontFamily: TYPE.display, fontSize: 22, fontWeight: 600, margin: 0 }}>{occ.title}</h2>
          <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2 }}>
            {occ.soc_code}
            {occ.total_employment && ` · ${occ.total_employment >= 1_000_000 ? `${(occ.total_employment / 1_000_000).toFixed(1)}M` : `${(occ.total_employment / 1000).toFixed(0)}K`} workers`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ContextualScoreCard label="Eloundou" value={occ.eloundou_beta_gpt4} percentile={occ.eloundou_percentile} median={occ.eloundou_median} population={occ.eloundou_population} signalColor={SIGNAL_COLORS.eloundou} sourceKey="eloundou" />
          <ContextualScoreCard label="Microsoft" value={occ.ms_ai_applicability} percentile={occ.ms_ai_percentile} median={occ.ms_ai_median} population={occ.ms_ai_population} signalColor={SIGNAL_COLORS.microsoft} sourceKey="microsoft" />
          <ContextualScoreCard label="AEI" value={occ.aei_exposure} percentile={occ.aei_percentile} median={occ.aei_median} population={occ.aei_population} signalColor={SIGNAL_COLORS.aei} sourceKey="aei" eraSnapshots={occ.aei_era_snapshots} />
          {occ.dominant_zone && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 16,
              backgroundColor: zoneColor + "15", color: zoneColor, border: `1px solid ${zoneColor}40`,
            }}>
              {ZONE_LABELS[occ.dominant_zone as keyof typeof ZONE_LABELS] || occ.dominant_zone}
            </span>
          )}
          {occ.gdpval_available && (
            <div
              onClick={() => setGdpvalExpanded(!gdpvalExpanded)}
              style={{
                display: "flex", flexDirection: "column", gap: 2, padding: "8px 14px",
                borderRadius: 10, backgroundColor: GDPVAL_COLORS.bg,
                border: `1.5px solid ${GDPVAL_COLORS.border}`,
                cursor: "pointer", transition: "box-shadow 0.15s",
                boxShadow: gdpvalExpanded ? `0 0 0 2px ${GDPVAL_COLORS.border}40` : "none",
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: GDPVAL_COLORS.primary, letterSpacing: 0.8 }}>
                GDPVAL
              </span>
              <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: GDPVAL_COLORS.primary }}>
                  {occ.gdpval_task_count}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, color: GDPVAL_COLORS.primary }}>tasks</span>
              </div>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: GDPVAL_COLORS.primary }}>
                  {gdpvalExpanded ? "Hide" : "View"} detail
                </span>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={GDPVAL_COLORS.primary} strokeWidth={2.5}>
                  <polyline points="6 9 12 15 18 9" style={{ transform: gdpvalExpanded ? "rotate(180deg)" : "none", transformOrigin: "center", transition: "transform 0.2s" }} />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GDPval Benchmark Panel — collapsible */}
      {occ.gdpval_available && (
        <GDPvalBenchmarkPanel
          socCode={occ.soc_code}
          taskCount={occ.gdpval_task_count}
          expanded={gdpvalExpanded}
          onToggle={() => setGdpvalExpanded(!gdpvalExpanded)}
        />
      )}

      {/* AEI Task Intelligence Panel — collapsible, uses already-fetched matrix data */}
      {matrixData && matrixData.available_eras.length > 0 && (
        <AEITaskDetailPanel
          matrixData={matrixData}
          expanded={aeiExpanded}
          onToggle={() => setAeiExpanded(!aeiExpanded)}
        />
      )}

      {/* HERO: Task Waterline — every task on the shared exposure scale */}
      {matrixData && (
        <TaskWaterline
          data={matrixData}
          gdpvalTasks={gdpvalTasks}
          onRequestGdpval={loadGdpvalTasks}
        />
      )}

      {/* Your bearings — the action layer: high ground, direction, tooling */}
      {matrixData && <BearingsPanel soc={soc} matrixData={matrixData} />}

      {/* Description (if available) */}
      {occ.description && (
        <div style={{ background: theme.surface, borderRadius: 12, border: `1.5px solid ${theme.line}`, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Occupation Description</div>
          <p style={{ fontSize: 13, color: theme.inkMuted, lineHeight: 1.6, margin: 0 }}>{occ.description}</p>
        </div>
      )}

      {/* Employment by sector — lower priority, below tasks */}
      {sectorData.length > 0 && (
        <div style={{ background: theme.surface, borderRadius: 12, border: `1.5px solid ${theme.line}`, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Employment by Sector (K)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sectorData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="headcount" fill={theme.brass} barSize={12} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Similar occupations — a static-build bonus: nearest roles by task/skill
          profile, from the precomputed embedding neighbours (neighbours.json). */}
      {IS_STATIC && <SimilarOccupations soc={occ.soc_code} />}
    </div>
  );
}

function SimilarOccupations({ soc }: { soc: string }) {
  const [items, setItems] = useState<SimilarOccupation[] | null>(null);
  const [, setSearchParams] = useSearchParams();
  useEffect(() => {
    let cancelled = false;
    similarOccupations(soc)
      .then((r) => { if (!cancelled) setItems(r); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [soc]);

  if (!items || items.length === 0) return null;
  return (
    <div style={{ background: theme.surface, borderRadius: 12, border: `1.5px solid ${theme.line}`, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Similar occupations</div>
      <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 12 }}>
        Nearest roles by task and skill profile
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((it) => {
          const zc = it.dominant_zone ? ZONE_COLORS[it.dominant_zone as keyof typeof ZONE_COLORS] : theme.inkMuted;
          return (
            <button
              key={it.soc_code}
              onClick={() => setSearchParams({ selected: it.soc_code })}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10,
                background: theme.ground, border: `1.5px solid ${theme.line}`, cursor: "pointer",
                fontSize: 12.5, textAlign: "left",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 4, background: zc, flexShrink: 0 }} />
              <span style={{ fontWeight: 500, color: theme.ink }}>{it.title}</span>
              {it.eloundou_beta != null && (
                <span style={{ color: theme.inkMuted, fontVariantNumeric: "tabular-nums" }}>
                  {it.eloundou_beta.toFixed(2)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
