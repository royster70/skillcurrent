import { useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea,
} from "recharts";
import type { TaskMatrixResponse } from "../lib/api";

const QUADRANT_COLORS = {
  insulated: { fill: "#FFF7ED", stroke: "#F97316", label: "Insulated" },
  augmented: { fill: "#EFF6FF", stroke: "#2563EB", label: "Augmented" },
  disrupted: { fill: "#F0FDF4", stroke: "#16A34A", label: "Disrupted" },
  routine: { fill: "#F9FAFB", stroke: "#D4D4D8", label: "Routine" },
};

export const DOT_COLORS: Record<string, string> = {
  insulated: "#F97316",
  augmented: "#2563EB",
  disrupted: "#16A34A",
  routine: "#A1A1AA",
};

const ERA_LABELS: Record<string, string> = {
  "sonnet-3.5": "Sonnet 3.5",
  "sonnet-3.7": "Sonnet 3.7",
  "sonnet-4": "Sonnet 4",
  "sonnet-4.5": "Sonnet 4.5",
};

type ViewMode = "baseline" | "era" | "drift";

interface TaskMatrixProps {
  data: TaskMatrixResponse;
  highlightedTaskId?: number | null;
}

export interface PlotPoint {
  x: number;
  y: number;
  taskId: number;
  task: string;
  quadrant: string;
  drift: string | null;
  velocity: number | null;
  driftDx: number;
  hasEraData: boolean;
  eraCount: number;
}

export function TaskMatrix({ data, highlightedTaskId }: TaskMatrixProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("baseline");
  const [selectedEra, setSelectedEra] = useState<string>(
    data.available_eras[data.available_eras.length - 1] || ""
  );

  const plotData: PlotPoint[] = data.tasks
    .filter((t) => t.importance != null)
    .map((t) => {
      let x = t.automation_potential || 0;

      if (viewMode === "era" && selectedEra) {
        const snap = t.era_snapshots.find((s) => s.model_era === selectedEra);
        if (snap) x = snap.automation_potential;
      }

      if (viewMode === "drift") {
        const latest = t.era_snapshots[t.era_snapshots.length - 1];
        if (latest) x = latest.automation_potential;
      }

      const high_imp = (t.importance || 0) >= 3.5;
      const high_auto = x >= 0.4;
      const quadrant = high_imp && !high_auto ? "insulated"
        : high_imp && high_auto ? "augmented"
        : !high_imp && high_auto ? "disrupted"
        : "routine";

      let driftDx = 0;
      if (viewMode === "drift" && t.era_snapshots.length >= 2) {
        const first = t.era_snapshots[0].automation_potential;
        const last = t.era_snapshots[t.era_snapshots.length - 1].automation_potential;
        driftDx = last - first;
      }

      return {
        x,
        y: t.importance || 0,
        taskId: t.task_id,
        task: t.task_text,
        quadrant,
        drift: t.drift_classification,
        velocity: t.drift_velocity,
        driftDx,
        hasEraData: t.era_snapshots.length > 0,
        eraCount: t.era_snapshots.length,
      };
    })
    .filter((p) => viewMode === "baseline" || p.hasEraData);

  const qCounts: Record<string, number> = { insulated: 0, augmented: 0, disrupted: 0, routine: 0 };
  plotData.forEach((p) => { qCounts[p.quadrant] = (qCounts[p.quadrant] || 0) + 1; });

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Task Positioning Matrix</div>
          <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
            {plotData.length} tasks · Click a task below to highlight it
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", borderRadius: 8, border: "1px solid #E4E4E7", overflow: "hidden" }}>
            {([
              { mode: "baseline" as const, label: "Baseline" },
              { mode: "era" as const, label: "By Era" },
              { mode: "drift" as const, label: "Drift" },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: viewMode === mode ? 600 : 400,
                  border: "none", cursor: "pointer",
                  backgroundColor: viewMode === mode ? "#2563EB" : "#fff",
                  color: viewMode === mode ? "#fff" : "#71717A",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {viewMode === "era" && data.available_eras.length > 0 && (
            <select value={selectedEra} onChange={(e) => setSelectedEra(e.target.value)}
              style={{ padding: "5px 8px", fontSize: 11, borderRadius: 6, border: "1px solid #E4E4E7" }}>
              {data.available_eras.map((era) => (
                <option key={era} value={era}>{ERA_LABELS[era] || era}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Quadrant legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        {Object.entries(QUADRANT_COLORS).map(([key, val]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: val.stroke }} />
            <span style={{ fontSize: 10, color: "#71717A" }}>{val.label} ({qCounts[key] || 0})</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 35, left: 20 }}>
          <ReferenceArea x1={0} x2={0.4} y1={3.5} y2={5} fill={QUADRANT_COLORS.insulated.fill} fillOpacity={1} />
          <ReferenceArea x1={0.4} x2={1} y1={3.5} y2={5} fill={QUADRANT_COLORS.augmented.fill} fillOpacity={1} />
          <ReferenceArea x1={0.4} x2={1} y1={1} y2={3.5} fill={QUADRANT_COLORS.disrupted.fill} fillOpacity={1} />
          <ReferenceArea x1={0} x2={0.4} y1={1} y2={3.5} fill={QUADRANT_COLORS.routine.fill} fillOpacity={1} />

          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
          <ReferenceLine x={0.4} stroke="#D4D4D8" strokeDasharray="6 3" strokeWidth={1.5} />
          <ReferenceLine y={3.5} stroke="#D4D4D8" strokeDasharray="6 3" strokeWidth={1.5} />

          <XAxis dataKey="x" type="number" domain={[0, 1]} tick={{ fontSize: 11 }}
            label={{ value: "Automation Potential →", position: "insideBottom", offset: -20, fontSize: 11, fill: "#71717A" }} />
          <YAxis dataKey="y" type="number" domain={[1, 5]} tick={{ fontSize: 11 }}
            label={{ value: "← Human Value", angle: -90, position: "insideLeft", offset: -5, fontSize: 11, fill: "#71717A" }} />

          <Tooltip content={({ payload }) => {
            if (!payload?.length) return null;
            const p = payload[0].payload;
            return (
              <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: 10, maxWidth: 320, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{p.task}</div>
                <div style={{ fontSize: 11, color: "#71717A" }}>
                  Importance: {p.y.toFixed(1)} · Automation: {(p.x * 100).toFixed(0)}%
                  {p.drift && ` · ${p.drift}`}
                </div>
              </div>
            );
          }} />

          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Scatter data={plotData} shape={(props: any) => {
            const { cx, cy, payload: p } = props;
            const color = DOT_COLORS[p.quadrant || "routine"];
            const isHighlighted = highlightedTaskId === p.taskId;
            const r = isHighlighted ? 9 : 5;
            const opacity = highlightedTaskId != null ? (isHighlighted ? 1 : 0.25) : 0.75;
            const strokeWidth = isHighlighted ? 2.5 : 0;

            if (viewMode === "drift" && p.driftDx !== 0) {
              const arrowLen = Math.min(Math.abs(p.driftDx) * 300, 50);
              const dir = p.driftDx > 0 ? 1 : -1;
              return (
                <g>
                  <circle cx={cx} cy={cy} r={r} fill={color} opacity={opacity}
                    stroke={isHighlighted ? "#18181B" : "none"} strokeWidth={strokeWidth} />
                  <line x1={cx} y1={cy} x2={cx + arrowLen * dir} y2={cy}
                    stroke={p.driftDx > 0 ? "#DC2626" : "#16A34A"} strokeWidth={1.5} />
                </g>
              );
            }

            return (
              <circle cx={cx} cy={cy} r={r} fill={color} opacity={opacity}
                stroke={isHighlighted ? "#18181B" : "none"} strokeWidth={strokeWidth}
                style={{ transition: "all 0.2s ease" }} />
            );
          }}>
            {plotData.map((_, i) => <Cell key={i} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: -22, padding: "0 40px" }}>
        <div style={{ fontSize: 10, color: "#A1A1AA", fontStyle: "italic" }}>Human Only</div>
        <div style={{ fontSize: 10, color: "#A1A1AA", fontStyle: "italic" }}>AI Ready</div>
      </div>
    </div>
  );
}
