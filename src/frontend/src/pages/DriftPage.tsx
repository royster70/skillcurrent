import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, CartesianGrid, Legend,
  PieChart, Pie,
} from "recharts";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { CLASSIFICATION_COLORS } from "../lib/constants";
import { MetricCard } from "../components/MetricCard";

export function DriftPage() {
  const { data: summary, loading } = useApi(() => api.driftSummary(), []);
  const { data: departing } = useApi(() => api.driftDeparting(1, 15), []);
  const { data: belowThreshold } = useApi(() => api.driftBelowThreshold(), []);
  const { data: enduring } = useApi(() => api.driftEnduring(1, 10), []);

  if (loading) return <div>Loading drift analysis...</div>;
  if (!summary) return null;

  // Classification pie
  const classPie = [
    { name: "Departing", value: summary.departing, fill: CLASSIFICATION_COLORS.departing },
    { name: "Enduring", value: summary.enduring, fill: CLASSIFICATION_COLORS.enduring },
    { name: "Below Threshold", value: summary.below_threshold, fill: CLASSIFICATION_COLORS.below_threshold },
    { name: "Unclassified", value: summary.unclassified, fill: "#D4D4D8" },
  ];

  // Departing tasks velocity chart
  const departingBars = (departing?.tasks || []).slice(0, 10).map((t) => ({
    name: t.task_text.length > 45 ? t.task_text.slice(0, 45) + "..." : t.task_text,
    velocity: (t.velocity || 0) * 1000,
    usage: t.latest_task_pct || 0,
    r2: t.r_squared || 0,
  }));

  // Scatter: all departing tasks — usage vs velocity
  const scatterData = (departing?.tasks || []).map((t) => ({
    x: t.latest_task_pct || 0,
    y: (t.velocity || 0) * 1000,
    name: t.task_text,
    r2: t.r_squared || 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Drift Analysis</h1>
        <p style={{ fontSize: 14, color: "#71717A", margin: "4px 0 0" }}>
          Task AI usage trajectories across {summary.total_tasks.toLocaleString()} tasks
          {" "}· 4 model eras (Sonnet 3.5 → 4.5)
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: "flex", gap: 16 }}>
        <MetricCard label="DEPARTING" value={summary.departing.toLocaleString()}
          subtitle="Rising AI usage" color={CLASSIFICATION_COLORS.departing} />
        <MetricCard label="ENDURING" value={summary.enduring.toLocaleString()}
          subtitle="Stable/declining usage" color={CLASSIFICATION_COLORS.enduring} />
        <MetricCard label="BELOW THRESHOLD" value={summary.below_threshold.toLocaleString()}
          subtitle="Will flip zone soon" color={CLASSIFICATION_COLORS.below_threshold}
          bgColor="#FFF7ED" borderColor="#FDBA74" />
        <MetricCard label="TOTAL TRACKED" value={summary.total_tasks.toLocaleString()}
          subtitle={`${summary.classified_tasks.toLocaleString()} classified`} color="#18181B" />
      </div>

      {/* Charts row */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Classification distribution */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Classification Distribution</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={classPie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius={55} outerRadius={95} paddingAngle={2}>
                {classPie.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Velocity scatter plot */}
        <div style={{ flex: 2, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Departing Tasks: Usage vs Velocity
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart margin={{ bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
              <XAxis dataKey="x" name="Current Usage %" tick={{ fontSize: 11 }}
                label={{ value: "Current Task Usage %", position: "insideBottom", offset: -5, fontSize: 11 }} />
              <YAxis dataKey="y" name="Velocity (×1000)" tick={{ fontSize: 11 }}
                label={{ value: "Velocity", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }}
                formatter={(val: number, name: string) => [val.toFixed(3), name]} />
              <Scatter data={scatterData} fill={CLASSIFICATION_COLORS.departing}>
                {scatterData.map((_, i) => (
                  <Cell key={i} fill={CLASSIFICATION_COLORS.departing} opacity={0.7} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Below threshold alert */}
      {belowThreshold && belowThreshold.tasks.length > 0 && (
        <div style={{
          background: "#FEF2F2", borderRadius: 12, border: "1.5px solid #FECACA", padding: 20,
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#DC2626", marginBottom: 12 }}>
            ⚠ Below Threshold — Highest Priority Signal
          </div>
          <p style={{ fontSize: 13, color: "#71717A", marginBottom: 16 }}>
            These tasks are at 40–50% AI usage with positive velocity — they will likely cross the automation threshold in the next 1–2 model generations.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {belowThreshold.tasks.map((t, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 8, padding: "12px 16px",
                border: "1px solid #FECACA", display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t.task_text}</div>
                <div style={{ display: "flex", gap: 16, flexShrink: 0, marginLeft: 16 }}>
                  <span style={{ fontSize: 13, color: "#71717A" }}>
                    Usage: <strong>{((t.latest_task_pct || 0) * 100).toFixed(1)}%</strong>
                  </span>
                  <span style={{ fontSize: 13, color: "#71717A" }}>
                    R²: <strong>{t.r_squared?.toFixed(2)}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top departing tasks */}
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Fastest Departing Tasks (velocity ×1000)
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={departingBars} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="velocity" fill={CLASSIFICATION_COLORS.departing} barSize={12} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Top Enduring Tasks (by current usage)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(enduring?.tasks || []).slice(0, 8).map((t, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", borderRadius: 8, border: "1px solid #E4E4E7",
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
                  {t.task_text.length > 55 ? t.task_text.slice(0, 55) + "..." : t.task_text}
                </div>
                <div style={{ fontSize: 12, color: CLASSIFICATION_COLORS.enduring, fontWeight: 600, flexShrink: 0 }}>
                  {((t.latest_task_pct || 0)).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
