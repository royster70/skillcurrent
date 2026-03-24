import { useState, useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea, Label,
} from "recharts";
import type { TaskMatrixResponse, TaskMatrixPoint, GDPvalTaskDetail } from "../lib/api";
import { GDPVAL_COLORS } from "../lib/constants";

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

const QUADRANT_DESCRIPTIONS: Record<string, string> = {
  insulated: "core human work",
  augmented: "human + AI",
  disrupted: "automation candidates",
  routine: "low-priority",
};

type OverlayMode = "none" | "usage" | "trend" | "gdpval";
type TrendType = "growing" | "declining" | "stable" | "unknown";

interface PlotPoint {
  x: number;
  y: number;
  displayX: number;
  displayY: number;
  taskId: number;
  task: string;
  quadrant: string;
  drift: string | null;
  velocity: number | null;
  usageIntensity: number;
  trend: TrendType;
  eraCount: number;
  latestPct: number | null;
  isNotable: boolean;
  notableReason: string | null;
}

interface TaskMatrixProps {
  data: TaskMatrixResponse;
  highlightedTaskId?: number | null;
  gdpvalTasks?: GDPvalTaskDetail[] | null;
  onRequestGdpval?: () => void;
}

// ── Collision-aware jitter ──
function resolveCollisions(points: PlotPoint[], minDist: number): PlotPoint[] {
  const out = points.map(p => ({ ...p, displayX: p.x, displayY: p.y }));
  const xThresh = 0.4;
  const yThresh = 3.5;

  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const dx = out[j].displayX - out[i].displayX;
        const dy = out[j].displayY - out[i].displayY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist > 0) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          out[i].displayX -= nx * push;
          out[i].displayY -= ny * push;
          out[j].displayX += nx * push;
          out[j].displayY += ny * push;
        } else if (dist === 0) {
          // Identical positions — nudge apart deterministically
          out[j].displayX += minDist * 0.5;
          out[j].displayY += minDist * 0.3;
        }
      }
    }
  }

  // Clamp to stay in correct quadrant and within axis bounds
  for (const p of out) {
    const origHighAuto = p.x >= xThresh;
    const origHighImp = p.y >= yThresh;
    if (origHighAuto && p.displayX < xThresh) p.displayX = xThresh + 0.005;
    if (!origHighAuto && p.displayX >= xThresh) p.displayX = xThresh - 0.005;
    if (origHighImp && p.displayY < yThresh) p.displayY = yThresh + 0.02;
    if (!origHighImp && p.displayY >= yThresh) p.displayY = yThresh - 0.02;
    p.displayX = Math.max(0, Math.min(1, p.displayX));
    p.displayY = Math.max(1, Math.min(5, p.displayY));
  }

  return out;
}

// ── Auto-generated narrative ──
function generateNarrative(points: PlotPoint[], qCounts: Record<string, number>): string | null {
  const total = points.length;
  if (total === 0) return null;

  const sorted = Object.entries(qCounts).sort((a, b) => b[1] - a[1]);
  const [dominant, dominantCount] = sorted[0];
  const growingCount = points.filter(p => p.trend === "growing").length;
  const decliningCount = points.filter(p => p.trend === "declining").length;

  let narrative = "";

  // Dominant quadrant
  const pct = Math.round((dominantCount / total) * 100);
  if (pct >= 70) {
    narrative = `${dominantCount} of ${total} tasks (${pct}%) sit in the ${dominant} zone — ${QUADRANT_DESCRIPTIONS[dominant]}`;
  } else if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) {
    narrative = `Tasks are evenly split between ${sorted[0][0]} and ${sorted[1][0]} zones`;
  } else {
    narrative = `${dominantCount} of ${total} tasks cluster in the ${dominant} zone, with the rest spread across ${sorted.filter(s => s[1] > 0).length - 1} other zones`;
  }

  // Trend context
  if (growingCount > 0 && decliningCount > 0) {
    narrative += `. ${growingCount} show growing AI usage while ${decliningCount} are declining`;
  } else if (decliningCount > 0) {
    narrative += `, with ${decliningCount} showing declining usage — adoption gaps where AI could help but isn't being used`;
  } else if (growingCount > 0) {
    narrative += `, with ${growingCount} showing growing AI usage`;
  }

  // Notable outlier
  const highestAuto = points.reduce((a, b) => a.x > b.x ? a : b);
  if (highestAuto.x > 0.35 && total > 3) {
    const shortName = highestAuto.task.length > 50 ? highestAuto.task.slice(0, 47) + "..." : highestAuto.task;
    narrative += `. "${shortName}" faces the highest AI capability exposure`;
  }

  return narrative + ".";
}

// ── Notable task identification ──
function markNotableTasks(points: PlotPoint[]): PlotPoint[] {
  if (points.length <= 3) return points; // Too few to annotate

  const out = points.map(p => ({ ...p, isNotable: false, notableReason: null as string | null }));
  let count = 0;
  const maxNotable = 3;

  // 1. Highest automation potential
  const byAuto = [...out].sort((a, b) => b.x - a.x);
  if (byAuto[0].x > 0.25 && count < maxNotable) {
    byAuto[0].isNotable = true;
    byAuto[0].notableReason = "Highest AI capability";
    count++;
  }

  // 2. Fastest growing trend
  const growingTasks = out.filter(p => p.trend === "growing" && !p.isNotable);
  if (growingTasks.length > 0 && count < maxNotable) {
    // Pick the one with highest latest usage
    const top = growingTasks.sort((a, b) => (b.latestPct || 0) - (a.latestPct || 0))[0];
    top.isNotable = true;
    top.notableReason = "Growing AI usage";
    count++;
  }

  // 3. Minority quadrant outlier
  const qCounts: Record<string, number> = {};
  out.forEach(p => { qCounts[p.quadrant] = (qCounts[p.quadrant] || 0) + 1; });
  const minority = Object.entries(qCounts).filter(([, c]) => c === 1);
  if (minority.length > 0 && count < maxNotable) {
    const outlier = out.find(p => p.quadrant === minority[0][0] && !p.isNotable);
    if (outlier) {
      outlier.isNotable = true;
      outlier.notableReason = `Only ${outlier.quadrant} task`;
      count++;
    }
  }

  return out;
}

export function TaskMatrix({ data, highlightedTaskId, gdpvalTasks, onRequestGdpval }: TaskMatrixProps) {
  const [overlay, setOverlay] = useState<OverlayMode>("usage");

  const plotData = useMemo(() => {
    const raw = data.tasks
      .filter((t) => t.importance != null && t.automation_potential != null)
      .map((t): PlotPoint => {
        const x = t.automation_potential || 0;
        const y = t.importance || 0;

        const high_imp = y >= 3.5;
        const high_auto = x >= 0.4;
        const quadrant = high_imp && !high_auto ? "insulated"
          : high_imp && high_auto ? "augmented"
          : !high_imp && high_auto ? "disrupted"
          : "routine";

        const latestEra = t.era_snapshots[t.era_snapshots.length - 1];
        const usageIntensity = latestEra ? Math.min(latestEra.task_pct / 2.0, 1.0) : 0;

        let trend: TrendType = "unknown";
        if (t.era_snapshots.length >= 2) {
          const first = t.era_snapshots[0].task_pct;
          const last = t.era_snapshots[t.era_snapshots.length - 1].task_pct;
          const delta = last - first;
          if (delta > 0.005) trend = "growing";
          else if (delta < -0.005) trend = "declining";
          else trend = "stable";
        }

        return {
          x, y, displayX: x, displayY: y,
          taskId: t.task_id, task: t.task_text, quadrant,
          drift: t.drift_classification, velocity: t.drift_velocity,
          usageIntensity, trend, eraCount: t.era_snapshots.length,
          latestPct: latestEra?.task_pct || null,
          isNotable: false, notableReason: null,
        };
      });

    // Apply notable task identification, then collision jitter
    const notable = markNotableTasks(raw);
    return resolveCollisions(notable, 0.04);
  }, [data.tasks]);

  const qCounts: Record<string, number> = { insulated: 0, augmented: 0, disrupted: 0, routine: 0 };
  plotData.forEach((p) => { qCounts[p.quadrant] = (qCounts[p.quadrant] || 0) + 1; });

  const growing = plotData.filter(p => p.trend === "growing").length;
  const declining = plotData.filter(p => p.trend === "declining").length;
  const stable = plotData.filter(p => p.trend === "stable").length;
  const hasJitter = plotData.some(p => Math.abs(p.displayX - p.x) > 0.001 || Math.abs(p.displayY - p.y) > 0.001);
  const narrative = useMemo(() => generateNarrative(plotData, qCounts), [plotData]);

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E4E4E7", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
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
              ...(data.gdpval_benchmark_count > 0
                ? [{ mode: "gdpval" as const, label: "GDPval" }]
                : []),
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => {
                  setOverlay(mode);
                  if (mode === "gdpval" && onRequestGdpval) onRequestGdpval();
                }}
                style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: overlay === mode ? 600 : 400,
                  border: "none", cursor: "pointer",
                  backgroundColor: overlay === mode
                    ? (mode === "gdpval" ? GDPVAL_COLORS.primary : "#2563EB")
                    : "#fff",
                  color: overlay === mode ? "#fff" : "#71717A",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Narrative summary */}
      {narrative && (
        <div style={{
          fontSize: 12, color: "#52525B", marginBottom: 10, padding: "8px 12px",
          borderLeft: "3px solid #2563EB20", backgroundColor: "#F8FAFC", borderRadius: "0 6px 6px 0",
          lineHeight: 1.5,
        }}>
          {narrative}
        </div>
      )}

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
          <ReferenceArea x1={0} x2={0.4} y1={3.5} y2={5} fill={QUADRANT_COLORS.insulated.fill} fillOpacity={1}>
            {qCounts.insulated > 0 && (
              <Label value={`${qCounts.insulated} — ${QUADRANT_DESCRIPTIONS.insulated}`}
                position="insideTopLeft" offset={8}
                style={{ fontSize: 9, fill: QUADRANT_COLORS.insulated.stroke, opacity: 0.6 }} />
            )}
          </ReferenceArea>
          <ReferenceArea x1={0.4} x2={1} y1={3.5} y2={5} fill={QUADRANT_COLORS.augmented.fill} fillOpacity={1}>
            {qCounts.augmented > 0 && (
              <Label value={`${qCounts.augmented} — ${QUADRANT_DESCRIPTIONS.augmented}`}
                position="insideTopRight" offset={8}
                style={{ fontSize: 9, fill: QUADRANT_COLORS.augmented.stroke, opacity: 0.6 }} />
            )}
          </ReferenceArea>
          <ReferenceArea x1={0.4} x2={1} y1={1} y2={3.5} fill={QUADRANT_COLORS.disrupted.fill} fillOpacity={1}>
            {qCounts.disrupted > 0 && (
              <Label value={`${qCounts.disrupted} — ${QUADRANT_DESCRIPTIONS.disrupted}`}
                position="insideBottomRight" offset={8}
                style={{ fontSize: 9, fill: QUADRANT_COLORS.disrupted.stroke, opacity: 0.6 }} />
            )}
          </ReferenceArea>
          <ReferenceArea x1={0} x2={0.4} y1={1} y2={3.5} fill={QUADRANT_COLORS.routine.fill} fillOpacity={1}>
            {qCounts.routine > 0 && (
              <Label value={`${qCounts.routine} — ${QUADRANT_DESCRIPTIONS.routine}`}
                position="insideBottomLeft" offset={8}
                style={{ fontSize: 9, fill: "#A1A1AA", opacity: 0.6 }} />
            )}
          </ReferenceArea>

          <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
          <ReferenceLine x={0.4} stroke="#D4D4D8" strokeDasharray="6 3" strokeWidth={1.5} />
          <ReferenceLine y={3.5} stroke="#D4D4D8" strokeDasharray="6 3" strokeWidth={1.5} />

          <XAxis dataKey="displayX" type="number" domain={[0, 1]} tick={{ fontSize: 11 }}
            label={{ value: "AI Capability (Eloundou) →", position: "insideBottom", offset: -20, fontSize: 11, fill: "#71717A" }} />
          <YAxis dataKey="displayY" type="number" domain={[1, 5]} tick={{ fontSize: 11 }}
            label={{ value: "← Human Value", angle: -90, position: "insideLeft", offset: -5, fontSize: 11, fill: "#71717A" }} />

          <Tooltip content={({ payload }) => {
            if (!payload?.length) return null;
            const p = payload[0].payload as PlotPoint;
            return (
              <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: 10, maxWidth: 350, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  {p.task}
                  {p.isNotable && (
                    <span style={{ fontSize: 10, fontWeight: 500, color: "#2563EB", marginLeft: 6 }}>
                      {p.notableReason}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#71717A" }}>
                  Importance: {p.y.toFixed(1)} · AI Capability: {(p.x * 100).toFixed(0)}%
                  · {QUADRANT_COLORS[p.quadrant as keyof typeof QUADRANT_COLORS]?.label || p.quadrant} zone
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
            if (p.isNotable) r = Math.max(r, 7);
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
                  {/* Notable task marker — small diamond indicator */}
                  {p.isNotable && !dimmed && (
                    <text x={cx} y={cy - r - 5} textAnchor="middle" fontSize={8} fill="#52525B" fontWeight={600}>
                      ▾
                    </text>
                  )}
                </g>
              );
            }

            return (
              <g>
                <circle cx={cx} cy={cy} r={r} fill={baseColor} opacity={opacity}
                  stroke={isHighlighted ? "#18181B" : p.isNotable && !dimmed ? "#52525B" : "none"}
                  strokeWidth={isHighlighted ? 2.5 : p.isNotable ? 1.5 : 0}
                  strokeDasharray={p.isNotable && !isHighlighted ? "3 2" : "none"}
                  style={{ transition: "all 0.2s ease" }} />
                {p.isNotable && !dimmed && (
                  <text x={cx} y={cy - r - 5} textAnchor="middle" fontSize={8} fill="#52525B" fontWeight={600}>
                    ▾
                  </text>
                )}
              </g>
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

      {hasJitter && (
        <div style={{ fontSize: 9, color: "#A1A1AA", textAlign: "right", marginTop: 4 }}>
          Dot positions adjusted slightly for readability · hover for exact values
        </div>
      )}

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
      {overlay === "gdpval" && (
        <GDPvalOverlayStrip
          benchmarkCount={data.gdpval_benchmark_count}
          tasks={gdpvalTasks ?? null}
        />
      )}
    </div>
  );
}

// ── GDPval Overlay Strip ──

function GDPvalOverlayStrip({ benchmarkCount, tasks }: { benchmarkCount: number; tasks: GDPvalTaskDetail[] | null }) {
  if (benchmarkCount === 0) return null;

  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 8,
      backgroundColor: GDPVAL_COLORS.bg,
      border: `1px solid ${GDPVAL_COLORS.border}`,
    }}>
      <div style={{ fontSize: 12, color: GDPVAL_COLORS.primary, fontWeight: 600, marginBottom: 4, fontFamily: "Inter, system-ui, sans-serif" }}>
        GDPval Benchmark — {benchmarkCount} real-world tasks
      </div>
      <div style={{ fontSize: 11, color: GDPVAL_COLORS.dark, marginBottom: 8, lineHeight: 1.4, fontFamily: "Inter, system-ui, sans-serif" }}>
        Independent evaluation prompts graded against rubric criteria.
        These are NOT O*NET task statements — they represent real-world deliverables that test AI capability for this occupation.
      </div>

      {!tasks ? (
        <div style={{ fontSize: 11, color: "#A1A1AA", fontStyle: "italic" }}>Loading benchmark tasks…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {tasks.map(task => {
            const maxScore = task.max_score ?? 0;
            const minScore = task.min_score ?? 0;
            const range = maxScore - minScore;
            // Normalize to chart width (0 = center, positive right, negative left)
            const chartW = 200;
            const zeroX = range > 0 ? Math.max((-minScore / range) * chartW, 0) : chartW / 2;

            return (
              <div key={task.task_id} style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
                <div style={{
                  width: 240, flexShrink: 0, fontSize: 11, color: "#52525B",
                  fontFamily: "Inter, system-ui, sans-serif",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {task.prompt_summary}
                </div>
                <svg width={chartW} height={16} style={{ flexShrink: 0 }}>
                  {/* Zero line */}
                  <line x1={zeroX} y1={0} x2={zeroX} y2={16} stroke="#D4D4D8" strokeWidth={1} strokeDasharray="2,2" />
                  {/* Range line */}
                  <line x1={0} y1={8} x2={chartW} y2={8} stroke={GDPVAL_COLORS.border} strokeWidth={2} />
                  {/* Min endpoint (penalty) */}
                  <circle cx={0} cy={8} r={4} fill={GDPVAL_COLORS.penalty} />
                  {/* Max endpoint (reward) */}
                  <circle cx={chartW} cy={8} r={5} fill={GDPVAL_COLORS.reward} />
                </svg>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: GDPVAL_COLORS.penalty, fontWeight: 500 }}>
                    {minScore > 0 ? `+${minScore}` : minScore}
                  </span>
                  <span style={{ fontSize: 10, color: "#D4D4D8" }}>→</span>
                  <span style={{ fontSize: 10, color: GDPVAL_COLORS.reward, fontWeight: 600 }}>
                    +{maxScore}
                  </span>
                  <span style={{
                    fontSize: 9, color: GDPVAL_COLORS.primary, backgroundColor: `${GDPVAL_COLORS.primary}10`,
                    padding: "1px 5px", borderRadius: 4,
                  }}>
                    {task.rubric_item_count} criteria
                  </span>
                </div>
              </div>
            );
          })}
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
