import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { ZONE_COLORS, ZONE_LABELS, CLASSIFICATION_COLORS } from "../lib/constants";
import { TaskMatrix, DOT_COLORS, TaskSparkline } from "../components/TaskMatrix";

export function OccupationsPage() {
  const { data: hierarchy, loading } = useApi(() => api.hierarchy(), []);
  const [selectedSoc, setSelectedSoc] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  if (loading) return <div>Loading occupations...</div>;
  if (!hierarchy) return null;

  return (
    <div style={{ display: "flex", gap: 24 }}>
      {/* Hierarchy panel */}
      <div style={{ width: 420, minWidth: 420, display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Occupations</h1>
        <p style={{ fontSize: 14, color: "#71717A", margin: "0 0 12px" }}>
          {hierarchy.total_occupations.toLocaleString()} occupations across {hierarchy.total_major_groups} groups
        </p>

        <div style={{
          background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7",
          overflow: "auto", maxHeight: "calc(100vh - 180px)",
        }}>
          {hierarchy.hierarchy.map((group) => (
            <div key={group.code}>
              <div
                onClick={() => setExpandedGroup(expandedGroup === group.code ? null : group.code)}
                style={{
                  padding: "10px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between",
                  alignItems: "center", borderBottom: "1px solid #F4F4F5",
                  backgroundColor: expandedGroup === group.code ? "#EFF6FF" : "transparent",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{group.title}</div>
                  <div style={{ fontSize: 12, color: "#71717A" }}>
                    {group.occupation_count} occupations
                    {group.total_employment ? ` · ${(group.total_employment / 1_000_000).toFixed(1)}M workers` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {group.avg_eloundou_beta != null && (
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                      backgroundColor: group.avg_eloundou_beta >= 0.85 ? "#F0FDF4" : group.avg_eloundou_beta >= 0.40 ? "#EFF6FF" : "#FFF7ED",
                      color: group.avg_eloundou_beta >= 0.85 ? ZONE_COLORS.E2 : group.avg_eloundou_beta >= 0.40 ? ZONE_COLORS.E1 : ZONE_COLORS.E0,
                    }}>
                      β {group.avg_eloundou_beta.toFixed(2)}
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: "#71717A" }}>{expandedGroup === group.code ? "▼" : "▶"}</span>
                </div>
              </div>

              {expandedGroup === group.code && group.children.map((occ) => (
                <div
                  key={occ.code}
                  onClick={() => setSelectedSoc(occ.code)}
                  style={{
                    padding: "8px 16px 8px 32px", cursor: "pointer",
                    borderBottom: "1px solid #F4F4F5",
                    backgroundColor: selectedSoc === occ.code ? "#DBEAFE" : "transparent",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{occ.title}</div>
                    <div style={{ fontSize: 11, color: "#A1A1AA" }}>{occ.code}</div>
                  </div>
                  {occ.avg_eloundou_beta != null && (
                    <span style={{ fontSize: 11, color: "#71717A" }}>
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
            height: "100%", color: "#A1A1AA", fontSize: 16,
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

  if (loading) return <div>Loading...</div>;
  if (!occ) return null;

  const zoneColor = occ.dominant_zone ? ZONE_COLORS[occ.dominant_zone as keyof typeof ZONE_COLORS] : "#71717A";

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
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{occ.title}</h2>
          <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
            {occ.soc_code}
            {occ.total_employment && ` · ${occ.total_employment >= 1_000_000 ? `${(occ.total_employment / 1_000_000).toFixed(1)}M` : `${(occ.total_employment / 1000).toFixed(0)}K`} workers`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ScoreChip label="Eloundou" value={occ.eloundou_beta_gpt4} color={ZONE_COLORS.E0} />
          <ScoreChip label="Microsoft" value={occ.ms_ai_applicability} color={ZONE_COLORS.E1} />
          <ScoreChip label="AEI" value={occ.aei_exposure} color={ZONE_COLORS.E2} />
          {occ.dominant_zone && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 16,
              backgroundColor: zoneColor + "15", color: zoneColor, border: `1px solid ${zoneColor}40`,
            }}>
              {ZONE_LABELS[occ.dominant_zone as keyof typeof ZONE_LABELS] || occ.dominant_zone}
            </span>
          )}
        </div>
      </div>

      {/* HERO: Task Positioning Matrix */}
      {matrixData && (
        <TaskMatrix data={matrixData} highlightedTaskId={highlightedTask} />
      )}

      {/* Task list — interactive, highlights on matrix */}
      {matrixData && matrixData.tasks.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #E4E4E7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Tasks ({matrixData.total_tasks})
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(matrixData.quadrant_counts).filter(([, v]) => v > 0).map(([q, count]) => (
                <span key={q} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                  color: DOT_COLORS[q] || "#71717A",
                  backgroundColor: (DOT_COLORS[q] || "#71717A") + "15",
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
                    borderBottom: "1px solid #F4F4F5",
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
                      <span style={{ fontSize: 10, color: "#A1A1AA" }}>
                        imp: {t.importance.toFixed(1)}
                      </span>
                    )}
                    {t.automation_potential != null && (
                      <span style={{ fontSize: 10, color: "#A1A1AA" }}>
                        auto: {(t.automation_potential * 100).toFixed(0)}%
                      </span>
                    )}
                    <TaskSparkline task={t} />
                    {t.drift_classification && (
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                        color: CLASSIFICATION_COLORS[t.drift_classification as keyof typeof CLASSIFICATION_COLORS] || "#71717A",
                        backgroundColor: (CLASSIFICATION_COLORS[t.drift_classification as keyof typeof CLASSIFICATION_COLORS] || "#71717A") + "15",
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
        <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Occupation Description</div>
          <p style={{ fontSize: 13, color: "#71717A", lineHeight: 1.6, margin: 0 }}>{occ.description}</p>
        </div>
      )}

      {/* Employment by sector — lower priority, below tasks */}
      {sectorData.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Employment by Sector (K)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sectorData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="headcount" fill="#2563EB" barSize={12} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ScoreChip({ label, value, color, format }: { label: string; value: number | null; color: string; format?: string }) {
  let display = "—";
  if (value != null) {
    if (format === "emp") {
      display = value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toLocaleString();
    } else {
      display = value.toFixed(3);
    }
  }
  return (
    <div style={{
      flex: 1, padding: "10px 14px", borderRadius: 8,
      border: `1px solid ${color}30`, backgroundColor: `${color}08`,
    }}>
      <div style={{ fontSize: 11, color: "#71717A", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{display}</div>
    </div>
  );
}

