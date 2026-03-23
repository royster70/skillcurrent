import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

const QUADRANT_COLORS = {
  insulated: { fill: "#FFF7ED", stroke: "#F97316", label: "Insulated", desc: "High value, human-only" },
  augmented: { fill: "#EFF6FF", stroke: "#2563EB", label: "Augmented", desc: "High value, AI-assisted (co-pilot)" },
  disrupted: { fill: "#F0FDF4", stroke: "#16A34A", label: "Disrupted", desc: "Routine, AI-ready (automate)" },
  routine: { fill: "#F9FAFB", stroke: "#D4D4D8", label: "Routine", desc: "Low value, human-only" },
};

const DOT_COLORS: Record<string, string> = {
  insulated: "#F97316",
  augmented: "#2563EB",
  disrupted: "#16A34A",
  routine: "#A1A1AA",
};

interface TaskMatrixProps {
  socCode: string;
}

export function TaskMatrix({ socCode }: TaskMatrixProps) {
  const { data, loading } = useApi(() => api.taskMatrix(socCode), [socCode]);
  if (loading) return <div style={{ padding: 20, color: "#71717A" }}>Loading task matrix...</div>;
  if (!data) return null;

  // Filter to tasks with both axes
  const plotData = data.tasks
    .filter((t) => t.importance != null && t.automation_potential != null)
    .map((t) => ({
      x: t.automation_potential!,
      y: t.importance!,
      task: t.task_text,
      quadrant: t.quadrant,
      drift: t.drift_classification,
      velocity: t.drift_velocity,
      penetration: t.aei_penetration,
      size: t.drift_velocity ? Math.max(Math.abs(t.drift_velocity) * 50000 + 40, 40) : 40,
    }));

  const noDataCount = data.tasks.length - plotData.length;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Task Positioning Matrix</div>
          <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
            {plotData.length} of {data.total_tasks} tasks plotted
            {noDataCount > 0 && ` · ${noDataCount} tasks lack exposure data`}
          </div>
        </div>

        {/* Quadrant legend */}
        <div style={{ display: "flex", gap: 12 }}>
          {Object.entries(QUADRANT_COLORS).map(([key, val]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: val.stroke }} />
              <span style={{ fontSize: 11, color: "#71717A" }}>
                {val.label} ({data.quadrant_counts[key] || 0})
              </span>
            </div>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 20 }}>
          {/* Quadrant backgrounds */}
          <ReferenceArea x1={0} x2={0.4} y1={3.5} y2={5} fill={QUADRANT_COLORS.insulated.fill} fillOpacity={1} />
          <ReferenceArea x1={0.4} x2={1} y1={3.5} y2={5} fill={QUADRANT_COLORS.augmented.fill} fillOpacity={1} />
          <ReferenceArea x1={0.4} x2={1} y1={1} y2={3.5} fill={QUADRANT_COLORS.disrupted.fill} fillOpacity={1} />
          <ReferenceArea x1={0} x2={0.4} y1={1} y2={3.5} fill={QUADRANT_COLORS.routine.fill} fillOpacity={1} />

          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />

          {/* Threshold lines */}
          <ReferenceLine x={0.4} stroke="#D4D4D8" strokeDasharray="6 3" strokeWidth={1.5} />
          <ReferenceLine y={3.5} stroke="#D4D4D8" strokeDasharray="6 3" strokeWidth={1.5} />

          <XAxis
            dataKey="x" type="number" domain={[0, 1]}
            tick={{ fontSize: 11 }}
            label={{ value: "Automation Potential →", position: "insideBottom", offset: -25, fontSize: 12, fill: "#71717A" }}
          />
          <YAxis
            dataKey="y" type="number" domain={[1, 5]}
            tick={{ fontSize: 11 }}
            label={{ value: "← Human Value Add", angle: -90, position: "insideLeft", offset: -5, fontSize: 12, fill: "#71717A" }}
          />

          <Tooltip
            content={({ payload }) => {
              if (!payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div style={{
                  background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8,
                  padding: 12, maxWidth: 350, boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{p.task}</div>
                  <div style={{ fontSize: 12, color: "#71717A" }}>
                    Importance: {p.y.toFixed(1)} · Automation: {(p.x * 100).toFixed(0)}%
                  </div>
                  {p.drift && (
                    <div style={{ fontSize: 11, color: DOT_COLORS[p.quadrant] || "#71717A", marginTop: 4 }}>
                      Drift: {p.drift} {p.velocity ? `(vel: ${p.velocity.toFixed(4)})` : ""}
                    </div>
                  )}
                </div>
              );
            }}
          />

          <Scatter data={plotData}>
            {plotData.map((point, i) => (
              <Cell
                key={i}
                fill={DOT_COLORS[point.quadrant || "routine"]}
                opacity={0.75}
                r={Math.sqrt(point.size) / 2}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Quadrant labels overlaid */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: -30, padding: "0 40px", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 11, color: "#71717A", fontStyle: "italic" }}>Human Only</div>
        <div style={{ fontSize: 11, color: "#71717A", fontStyle: "italic" }}>AI Ready</div>
      </div>
    </div>
  );
}
