import { useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea,
} from "recharts";
import type { TaskMatrixResponse, TaskMatrixPoint } from "../lib/api";

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

type OverlayMode = "none" | "usage" | "trend";

interface TaskMatrixProps {
  data: TaskMatrixResponse;
  highlightedTaskId?: number | null;
}

export function TaskMatrix({ data, highlightedTaskId }: TaskMatrixProps) {
  const [overlay, setOverlay] = useState<OverlayMode>("usage");

  const plotData = data.tasks
    .filter((t) => t.importance != null && t.automation_potential != null)
    .map((t) => {
      // Position is ALWAYS based on Eloundou exposure (capability doesn't go backward)
      const x = t.automation_potential || 0;
      const y = t.importance || 0;

      const high_imp = y >= 3.5;
      const high_auto = x >= 0.4;
      const quadrant = high_imp && !high_auto ? "insulated"
        : high_imp && high_auto ? "augmented"
        : !high_imp && high_auto ? "disrupted"
        : "routine";

      // Usage intensity: latest AEI era's task_pct (normalised 0-1)
      const latestEra = t.era_snapshots[t.era_snapshots.length - 1];
      const usageIntensity = latestEra ? Math.min(latestEra.task_pct / 2.0, 1.0) : 0;

      // Usage trend: comparing first and last era
      let trend: "growing" | "declining" | "stable" | "unknown" = "unknown";
      if (t.era_snapshots.length >= 2) {
        const first = t.era_snapshots[0].task_pct;
        const last = t.era_snapshots[t.era_snapshots.length - 1].task_pct;
        const delta = last - first;
        if (delta > 0.005) trend = "growing";
        else if (delta < -0.005) trend = "declining";
        else trend = "stable";
      }

      return {
        x, y,
        taskId: t.task_id,
        task: t.task_text,
        quadrant,
        drift: t.drift_classification,
        velocity: t.drift_velocity,
        usageIntensity,
        trend,
        eraCount: t.era_snapshots.length,
        latestPct: latestEra?.task_pct || null,
      };
    });

  const qCounts: Record<string, number> = { insulated: 0, augmented: 0, disrupted: 0, routine: 0 };
  plotData.forEach((p) => { qCounts[p.quadrant] = (qCounts[p.quadrant] || 0) + 1; });

  const growing = plotData.filter(p => p.trend === "growing").length;
  const declining = plotData.filter(p => p.trend === "declining").length;
  const stable = plotData.filter(p => p.trend === "stable").length;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Task Positioning Matrix</div>
          <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
            {plotData.length} tasks · Position = AI capability (fixed) · Overlay = actual usage
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#A1A1AA" }}>Overlay:</span>
          <div style={{ display: "flex", borderRadius: 8, border: "1px solid #E4E4E7", overflow: "hidden" }}>
            {([
              { mode: "none" as const, label: "None" },
              { mode: "usage" as const, label: "Usage Level" },
              { mode: "trend" as const, label: "Usage Trend" },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setOverlay(mode)}
                style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: overlay === mode ? 600 : 400,
                  border: "none", cursor: "pointer",
                  backgroundColor: overlay === mode ? "#2563EB" : "#fff",
                  color: overlay === mode ? "#fff" : "#71717A",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        {Object.entries(QUADRANT_COLORS).map(([key, val]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: val.stroke }} />
            <span style={{ fontSize: 10, color: "#71717A" }}>{val.label} ({qCounts[key] || 0})</span>
          </div>
        ))}
        {overlay === "trend" && (
          <>
            <span style={{ fontSize: 10, color: "#71717A" }}>|</span>
            <span style={{ fontSize: 10, color: "#DC2626" }}>● Growing ({growing})</span>
            <span style={{ fontSize: 10, color: "#A1A1AA" }}>● Stable ({stable})</span>
            <span style={{ fontSize: 10, color: "#71717A" }}>○ Declining ({declining})</span>
          </>
        )}
        {overlay === "usage" && (
          <span style={{ fontSize: 10, color: "#71717A" }}>| Dot size = current AI usage level</span>
        )}
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
            label={{ value: "AI Capability (Eloundou) →", position: "insideBottom", offset: -20, fontSize: 11, fill: "#71717A" }} />
          <YAxis dataKey="y" type="number" domain={[1, 5]} tick={{ fontSize: 11 }}
            label={{ value: "← Human Value", angle: -90, position: "insideLeft", offset: -5, fontSize: 11, fill: "#71717A" }} />

          <Tooltip content={({ payload }) => {
            if (!payload?.length) return null;
            const p = payload[0].payload;
            return (
              <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: 10, maxWidth: 350, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{p.task}</div>
                <div style={{ fontSize: 11, color: "#71717A" }}>
                  Importance: {p.y.toFixed(1)} · AI Capability: {(p.x * 100).toFixed(0)}%
                  · Quadrant: {p.quadrant}
                </div>
                {p.latestPct != null && (
                  <div style={{ fontSize: 11, marginTop: 2, color: p.trend === "growing" ? "#DC2626" : "#A1A1AA" }}>
                    Current usage: {p.latestPct.toFixed(2)}%
                    {p.trend !== "unknown" && ` · Trend: ${p.trend} (${p.eraCount} eras)`}
                  </div>
                )}
              </div>
            );
          }} />

          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Scatter data={plotData} shape={(props: any) => {
            const { cx, cy, payload: p } = props;
            const baseColor = DOT_COLORS[p.quadrant || "routine"];
            const isHighlighted = highlightedTaskId === p.taskId;
            const dimmed = highlightedTaskId != null && !isHighlighted;

            let r = 5;
            if (overlay === "usage") {
              r = 3 + p.usageIntensity * 10;
            }
            if (isHighlighted) r = Math.max(r, 9);

            const opacity = dimmed ? 0.15 : (overlay === "usage" ? 0.4 + p.usageIntensity * 0.5 : 0.75);

            if (overlay === "trend") {
              const ringColor = p.trend === "growing" ? "#DC2626"
                : p.trend === "declining" ? "#D4D4D8"
                : p.trend === "stable" ? "#A1A1AA"
                : "none";
              const ringWidth = p.trend === "growing" ? 2.5 : p.trend === "declining" ? 1.5 : 0;
              const fillOpacity = dimmed ? 0.15 : (p.trend === "declining" ? 0.3 : 0.7);

              return (
                <g>
                  {ringWidth > 0 && (
                    <circle cx={cx} cy={cy} r={r + 3} fill="none"
                      stroke={ringColor} strokeWidth={ringWidth} opacity={dimmed ? 0.1 : 0.8} />
                  )}
                  <circle cx={cx} cy={cy} r={r} fill={baseColor} opacity={fillOpacity}
                    stroke={isHighlighted ? "#18181B" : "none"} strokeWidth={isHighlighted ? 2.5 : 0} />
                </g>
              );
            }

            return (
              <circle cx={cx} cy={cy} r={r} fill={baseColor} opacity={opacity}
                stroke={isHighlighted ? "#18181B" : "none"} strokeWidth={isHighlighted ? 2.5 : 0}
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

      {overlay === "trend" && (
        <div style={{ marginTop: 12, padding: 10, backgroundColor: "#F9FAFB", borderRadius: 8, fontSize: 12, color: "#71717A" }}>
          Position is fixed (AI capability doesn't go backward). Rings show empirical usage trend across {data.available_eras.length} model eras.
          <span style={{ color: "#DC2626" }}> Red ring</span> = growing AI usage.
          <span style={{ color: "#A1A1AA" }}> Grey</span> = stable.
          <span style={{ color: "#D4D4D8" }}> Faded</span> = declining usage (adoption gap — AI can do it but isn't being used).
        </div>
      )}
      {overlay === "usage" && (
        <div style={{ marginTop: 12, padding: 10, backgroundColor: "#F9FAFB", borderRadius: 8, fontSize: 12, color: "#71717A" }}>
          Dot size and opacity = current AI usage level. Large bright = heavily used with AI.
          Small faded = AI-capable but low adoption. The gap between position and size reveals adoption opportunities.
        </div>
      )}
    </div>
  );
}

/** Mini sparkline for task list — shows usage across model eras. */
export function TaskSparkline({ task }: { task: TaskMatrixPoint }) {
  if (task.era_snapshots.length < 2) return null;

  const values = task.era_snapshots.map(s => s.task_pct);
  const max = Math.max(...values, 0.01);
  const width = 60;
  const height = 18;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  }).join(" ");

  const isGrowing = values[values.length - 1] > values[0] + 0.005;
  const color = isGrowing ? "#DC2626" : "#A1A1AA";

  return (
    <svg width={width} height={height} style={{ flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
      <circle
        cx={width}
        cy={height - (values[values.length - 1] / max) * height}
        r={2} fill={color}
      />
    </svg>
  );
}
