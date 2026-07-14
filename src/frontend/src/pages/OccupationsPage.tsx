import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useApi } from "../hooks/useApi";
import { api, type GDPvalTaskDetail } from "../lib/api";
import { ZONE_COLORS, ZONE_BG, ZONE_LABELS, CLASSIFICATION_COLORS, SIGNAL_COLORS, THEME, TYPE, BRASS_TINT } from "../lib/constants";
import { TaskMatrix, DOT_COLORS, TaskSparkline } from "../components/TaskMatrix";
import { ContextualScoreCard } from "../components/ContextualScoreCard";
import { GDPvalBenchmarkPanel } from "../components/GDPvalBenchmarkPanel";
import { AEITaskDetailPanel } from "../components/AEITaskDetailPanel";
import { GDPVAL_COLORS } from "../lib/constants";

const theme = THEME.light;

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
    <div style={{ display: "flex", gap: 24, fontFamily: TYPE.body, color: theme.ink }}>
      {/* Hierarchy panel */}
      <div style={{ width: 420, minWidth: 420, display: "flex", flexDirection: "column", gap: 8 }}>
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
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                      backgroundColor: group.avg_eloundou_beta >= 0.85 ? ZONE_BG.E2 : group.avg_eloundou_beta >= 0.40 ? ZONE_BG.E1 : ZONE_BG.E0,
                      color: group.avg_eloundou_beta >= 0.85 ? ZONE_COLORS.E2 : group.avg_eloundou_beta >= 0.40 ? ZONE_COLORS.E1 : ZONE_COLORS.E0,
                    }}>
                      β {group.avg_eloundou_beta.toFixed(2)}
                    </span>
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
                    <span style={{ fontSize: 11, color: theme.inkMuted }}>
                      β {occ.avg_eloundou_beta.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1 }}>
        {selectedSoc ? (
          <OccupationDetailPanel soc={selectedSoc} />
        ) : (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", color: theme.inkMuted, fontSize: 16,
          }}>
            Select an occupation from the hierarchy
          </div>
        )}
      </div>
    </div>
  );
}

function OccupationDetailPanel({ soc }: { soc: string }) {
  const { data: occ, loading } = useApi(() => api.occupation(soc), [soc]);
  const { data: matrixData } = useApi(() => api.taskMatrix(soc), [soc]);
  const [highlightedTask, setHighlightedTask] = useState<number | null>(null);
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

      {/* HERO: Task Positioning Matrix */}
      {matrixData && (
        <TaskMatrix
          data={matrixData}
          highlightedTaskId={highlightedTask}
          gdpvalTasks={gdpvalTasks}
          onRequestGdpval={loadGdpvalTasks}
        />
      )}

      {/* Task list — interactive, highlights on matrix */}
      {matrixData && matrixData.tasks.length > 0 && (
        <div style={{ background: theme.surface, borderRadius: 12, border: `1.5px solid ${theme.line}`, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${theme.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Tasks ({matrixData.total_tasks})
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(matrixData.quadrant_counts).filter(([, v]) => v > 0).map(([q, count]) => (
                <span key={q} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                  color: DOT_COLORS[q] || theme.inkMuted,
                  backgroundColor: (DOT_COLORS[q] || theme.inkMuted) + "15",
                }}>
                  {q}: {count}
                </span>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 350, overflow: "auto" }}>
            {matrixData.tasks.map((t) => {
              const isHighlighted = highlightedTask === t.task_id;
              const qColor = DOT_COLORS[t.quadrant || "routine"];
              return (
                <div
                  key={t.task_id}
                  onMouseEnter={() => setHighlightedTask(t.task_id)}
                  onMouseLeave={() => setHighlightedTask(null)}
                  onClick={() => setHighlightedTask(isHighlighted ? null : t.task_id)}
                  style={{
                    padding: "8px 16px", cursor: "pointer",
                    borderBottom: `1px solid ${theme.line}`,
                    backgroundColor: isHighlighted ? `${qColor}10` : "transparent",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    transition: "background-color 0.15s",
                  }}
                >
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                      backgroundColor: qColor,
                    }} />
                    <div style={{ fontSize: 12, fontWeight: isHighlighted ? 600 : 400, lineHeight: 1.4 }}>
                      {t.task_text}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexShrink: 0, marginLeft: 12, alignItems: "center" }}>
                    {t.importance != null && (
                      <span style={{ fontSize: 10, color: theme.inkMuted }}>
                        imp: {t.importance.toFixed(1)}
                      </span>
                    )}
                    {t.automation_potential != null && (
                      <span style={{ fontSize: 10, color: theme.inkMuted }}>
                        auto: {(t.automation_potential * 100).toFixed(0)}%
                      </span>
                    )}
                    <TaskSparkline task={t} />
                    {t.drift_classification && (
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                        color: CLASSIFICATION_COLORS[t.drift_classification as keyof typeof CLASSIFICATION_COLORS] || theme.inkMuted,
                        backgroundColor: (CLASSIFICATION_COLORS[t.drift_classification as keyof typeof CLASSIFICATION_COLORS] || theme.inkMuted) + "15",
                      }}>
                        {t.drift_classification}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
    </div>
  );
}
