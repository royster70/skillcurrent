import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { ZONE_COLORS, ZONE_LABELS, CLASSIFICATION_COLORS } from "../lib/constants";
import { TaskMatrix } from "../components/TaskMatrix";

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
  const { data: tasks } = useApi(() => api.occupationTasks(soc), [soc]);

  if (loading) return <div>Loading...</div>;
  if (!occ) return null;

  // Sector breakdown bar chart
  const sectorData = (occ.top_sectors || []).slice(0, 6).map((s) => ({
    name: s.naics_title.length > 20 ? s.naics_title.slice(0, 20) + "..." : s.naics_title,
    headcount: (s.headcount || 0) / 1000,
  }));

  // Task drift chart — top tasks by usage
  const taskData = (tasks?.tasks || [])
    .filter((t) => t.task_pct != null && t.task_pct > 0)
    .slice(0, 8)
    .map((t) => ({
      name: t.task_text.length > 40 ? t.task_text.slice(0, 40) + "..." : t.task_text,
      usage: t.task_pct || 0,
      velocity: (t.velocity || 0) * 100000,
      classification: t.classification,
    }));

  const zoneColor = occ.dominant_zone ? ZONE_COLORS[occ.dominant_zone as keyof typeof ZONE_COLORS] : "#71717A";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{occ.title}</h2>
            <div style={{ fontSize: 13, color: "#71717A", marginTop: 4 }}>{occ.soc_code}</div>
          </div>
          {occ.dominant_zone && (
            <span style={{
              fontSize: 14, fontWeight: 600, padding: "6px 16px", borderRadius: 20,
              backgroundColor: zoneColor + "15", color: zoneColor, border: `1px solid ${zoneColor}40`,
            }}>
              {ZONE_LABELS[occ.dominant_zone as keyof typeof ZONE_LABELS] || occ.dominant_zone} Zone
            </span>
          )}
        </div>
        {occ.description && (
          <p style={{ fontSize: 13, color: "#71717A", marginTop: 12, lineHeight: 1.5 }}>{occ.description}</p>
        )}

        {/* Score cards */}
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <ScoreChip label="Eloundou β" value={occ.eloundou_beta_gpt4} color={ZONE_COLORS.E0} />
          <ScoreChip label="Microsoft AI" value={occ.ms_ai_applicability} color={ZONE_COLORS.E1} />
          <ScoreChip label="AEI Exposure" value={occ.aei_exposure} color={ZONE_COLORS.E2} />
          <ScoreChip label="Employment" value={occ.total_employment} color="#18181B" format="emp" />
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Sector breakdown */}
        {sectorData.length > 0 && (
          <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Employment by Sector (K)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sectorData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="headcount" fill="#2563EB" barSize={12} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Task usage with drift */}
        {taskData.length > 0 && (
          <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Top Tasks by AI Usage (%)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={taskData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="usage" barSize={10} radius={[0, 4, 4, 0]}>
                  {taskData.map((t, i) => (
                    <Cell key={i} fill={
                      t.classification === "departing" ? CLASSIFICATION_COLORS.departing :
                      t.classification === "below_threshold" ? CLASSIFICATION_COLORS.below_threshold :
                      t.classification === "enduring" ? CLASSIFICATION_COLORS.enduring :
                      "#94A3B8"
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Task Positioning Matrix */}
      <TaskMatrix socCode={occ.soc_code} />
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

// Need to import Cell for conditional bar colors
import { Cell } from "recharts";
