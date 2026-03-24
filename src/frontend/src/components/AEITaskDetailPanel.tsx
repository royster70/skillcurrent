/**
 * AEI Task Detail Panel — collapsible panel showing Anthropic Economic Index
 * task-level intelligence for an occupation.
 *
 * Three custom SVG visualizations:
 *  1. Temporal Trajectory — multi-line chart of task_pct across model eras
 *  2. Automation vs Augmentation — stacked bars per task
 *  3. Coverage Indicator — ring showing what fraction of tasks have AEI data
 *
 * Consumes data already fetched by the TaskMatrix endpoint — no extra API call.
 */

import { useState, useMemo } from "react";
import { type TaskMatrixResponse, type TaskMatrixPoint } from "../lib/api";
import { AEI_COLORS } from "../lib/constants";

interface Props {
  matrixData: TaskMatrixResponse;
  expanded: boolean;
  onToggle: () => void;
}

// ── Constants ──

const ERA_ORDER: Record<string, number> = {
  "sonnet-3.5": 1, "sonnet-3.7": 2, "sonnet-4": 3, "sonnet-4.5": 4,
};

const ERA_SHORT: Record<string, string> = {
  "sonnet-3.5": "3.5", "sonnet-3.7": "3.7", "sonnet-4": "4.0", "sonnet-4.5": "4.5",
};

// ── Main Component ──

export function AEITaskDetailPanel({ matrixData, expanded, onToggle }: Props) {
  const trackedTasks = matrixData.tasks.filter(t => t.era_snapshots.length > 0);
  const totalTasks = matrixData.total_tasks;
  const trackedCount = trackedTasks.length;
  const eras = matrixData.available_eras;

  if (trackedCount === 0) return null; // No AEI data at all

  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${AEI_COLORS.border}`,
      overflow: "hidden",
      transition: "all 0.3s ease",
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 20px",
          backgroundColor: AEI_COLORS.bg,
          borderBottom: expanded ? `1px solid ${AEI_COLORS.border}40` : "none",
          cursor: "pointer", userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={AEI_COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: AEI_COLORS.primary, fontFamily: "Inter, system-ui, sans-serif" }}>
            AEI Task Intelligence
          </span>
          <span style={{ fontSize: 13, color: AEI_COLORS.dark, fontFamily: "Inter, system-ui, sans-serif" }}>
            &middot; {trackedCount} of {totalTasks} tasks tracked &middot; {eras.length} model eras
          </span>
        </div>
        <svg
          width={16} height={16} viewBox="0 0 24 24" fill="none"
          stroke={AEI_COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s ease" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Body */}
      <div style={{
        maxHeight: expanded ? 900 : 0,
        overflow: "hidden",
        transition: "max-height 0.3s ease",
      }}>
        {expanded && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
            <TemporalTrajectory tasks={trackedTasks} eras={eras} />
            <PenetrationRanking tasks={matrixData.tasks} />
            <div style={{ display: "flex", gap: 24 }}>
              <AutoAugSplit tasks={trackedTasks} />
              <CoverageRing tracked={trackedCount} total={totalTasks} tasks={trackedTasks} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Temporal Trajectory (Multi-line chart) ──

function TemporalTrajectory({ tasks, eras }: { tasks: TaskMatrixPoint[]; eras: string[] }) {
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

  const sortedEras = useMemo(
    () => [...eras].sort((a, b) => (ERA_ORDER[a] ?? 99) - (ERA_ORDER[b] ?? 99)),
    [eras],
  );

  // Compute data lines: one per task, sorted by latest task_pct descending
  const lines = useMemo(() => {
    return tasks
      .map(t => {
        const byEra = new Map(t.era_snapshots.map(s => [s.model_era, s]));
        const points = sortedEras.map(era => byEra.get(era)?.task_pct ?? null);
        const latest = points.filter(p => p !== null).pop() ?? 0;
        return { taskId: t.task_id, taskText: t.task_text, points, latest };
      })
      .sort((a, b) => b.latest - a.latest);
  }, [tasks, sortedEras]);

  if (lines.length === 0 || sortedEras.length < 2) return null;

  // Chart dimensions
  const chartW = 800, chartH = 180;
  const padLeft = 50, padRight = 120, padTop = 10, padBottom = 30;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  const maxPct = Math.max(...lines.flatMap(l => l.points.filter((p): p is number => p !== null)), 0.01);

  const toX = (eraIdx: number) => padLeft + (eraIdx / (sortedEras.length - 1)) * plotW;
  const toY = (pct: number) => padTop + plotH - (pct / maxPct) * plotH;

  // Only label top 5 lines to avoid clutter
  const labelledLines = lines.slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#A1A1AA", letterSpacing: 0.8, fontFamily: "Inter, system-ui, sans-serif" }}>
          TASK USAGE TRAJECTORY
        </div>
        <div style={{ fontSize: 12, color: "#71717A", marginTop: 2, fontFamily: "Inter, system-ui, sans-serif" }}>
          AI usage % per task across {sortedEras.length} model generations ({ERA_SHORT[sortedEras[0]]} → {ERA_SHORT[sortedEras[sortedEras.length - 1]]})
        </div>
      </div>

      <svg width={chartW} height={chartH} style={{ display: "block", backgroundColor: "#FAFAFA", borderRadius: 8, border: "1px solid #E4E4E7" }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(frac => (
          <line key={frac} x1={padLeft} y1={toY(maxPct * frac)} x2={chartW - padRight} y2={toY(maxPct * frac)}
            stroke="#E4E4E7" strokeWidth={0.5} strokeDasharray="4,4" />
        ))}
        {/* Y-axis */}
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH} stroke="#E4E4E7" strokeWidth={1} />
        {/* X-axis */}
        <line x1={padLeft} y1={padTop + plotH} x2={chartW - padRight} y2={padTop + plotH} stroke="#E4E4E7" strokeWidth={1} />
        {/* Y label */}
        <text x={8} y={padTop + plotH / 2} fontSize={9} fill="#A1A1AA" fontFamily="Inter, system-ui, sans-serif"
          transform={`rotate(-90, 8, ${padTop + plotH / 2})`} textAnchor="middle">
          Usage %
        </text>
        {/* Era labels */}
        {sortedEras.map((era, i) => (
          <text key={era} x={toX(i)} y={chartH - 5} textAnchor="middle"
            fontSize={10} fontWeight={500} fill="#A1A1AA" fontFamily="Inter, system-ui, sans-serif">
            {ERA_SHORT[era] ?? era}
          </text>
        ))}

        {/* Lines — dimmed ones first, then highlighted */}
        {lines.map((line, lineIdx) => {
          const isHovered = hoveredTask === line.taskText;
          const isTop5 = lineIdx < 5;
          const opacity = hoveredTask ? (isHovered ? 1 : 0.15) : (isTop5 ? 0.7 - lineIdx * 0.12 : 0.1);
          const weight = isHovered ? 2.5 : (isTop5 ? 1.8 - lineIdx * 0.2 : 0.8);

          const pathParts: string[] = [];
          line.points.forEach((pct, i) => {
            if (pct === null) return;
            const cmd = pathParts.length === 0 ? "M" : "L";
            pathParts.push(`${cmd} ${toX(i)} ${toY(pct)}`);
          });
          if (pathParts.length < 2) return null;

          return (
            <g key={line.taskId}
              onMouseEnter={() => setHoveredTask(line.taskText)}
              onMouseLeave={() => setHoveredTask(null)}
              style={{ cursor: "pointer" }}
            >
              <path d={pathParts.join(" ")} fill="none"
                stroke={AEI_COLORS.primary} strokeWidth={weight} opacity={opacity} />
              {/* End dot */}
              {line.points[line.points.length - 1] != null && (
                <circle
                  cx={toX(sortedEras.length - 1)}
                  cy={toY(line.points[line.points.length - 1]!)}
                  r={isHovered ? 5 : (isTop5 ? 3.5 : 2)}
                  fill={AEI_COLORS.primary} opacity={opacity}
                />
              )}
            </g>
          );
        })}

        {/* End labels for top lines */}
        {labelledLines.map((line) => {
          const lastPct = line.points[line.points.length - 1];
          if (lastPct == null) return null;
          const y = toY(lastPct);
          const isHovered = hoveredTask === line.taskText;
          return (
            <text key={line.taskId}
              x={chartW - padRight + 8} y={y + 3}
              fontSize={9} fontWeight={isHovered ? 700 : 400}
              fill={AEI_COLORS.primary}
              opacity={hoveredTask ? (isHovered ? 1 : 0.3) : 0.8}
              fontFamily="Inter, system-ui, sans-serif"
              onMouseEnter={() => setHoveredTask(line.taskText)}
              onMouseLeave={() => setHoveredTask(null)}
              style={{ cursor: "pointer" }}
            >
              {line.taskText.length > 25 ? line.taskText.slice(0, 25) + "..." : line.taskText}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Task Penetration Ranking (Horizontal Bars) ──

function PenetrationRanking({ tasks }: { tasks: TaskMatrixPoint[] }) {
  const ranked = useMemo(() => {
    return tasks
      .filter(t => t.aei_penetration != null && t.aei_penetration > 0)
      .sort((a, b) => (b.aei_penetration ?? 0) - (a.aei_penetration ?? 0))
      .slice(0, 10);
  }, [tasks]);

  if (ranked.length === 0) return null;

  const maxPen = ranked[0].aei_penetration ?? 0.01;
  const barMaxW = 320;

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#A1A1AA", letterSpacing: 0.8, fontFamily: "Inter, system-ui, sans-serif" }}>
          TASK PENETRATION RANKING
        </div>
        <div style={{ fontSize: 12, color: "#71717A", marginTop: 2, fontFamily: "Inter, system-ui, sans-serif" }}>
          Top tasks by AI usage penetration across conversations
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {ranked.map((task, i) => {
          const pct = task.aei_penetration ?? 0;
          const barW = (pct / maxPen) * barMaxW;
          return (
            <div key={task.task_id} style={{ display: "flex", alignItems: "center", gap: 6, height: 28 }}>
              <div style={{
                width: 14, flexShrink: 0, fontSize: 10, color: "#A1A1AA",
                fontFamily: "Inter, system-ui, sans-serif", textAlign: "right",
              }}>
                {i + 1}
              </div>
              <div style={{
                width: 180, flexShrink: 0, fontSize: 11, color: "#52525B",
                fontFamily: "Inter, system-ui, sans-serif",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {task.task_text}
              </div>
              <div style={{
                width: barW, minWidth: 4, height: 16,
                backgroundColor: AEI_COLORS.primary, borderRadius: 3,
                opacity: 0.7 + (pct / maxPen) * 0.3,
              }} />
              <span style={{
                fontSize: 10, color: "#52525B", fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 500, flexShrink: 0, minWidth: 50,
              }}>
                {(pct * 100).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Automation vs Augmentation (Stacked Bars) ──

function AutoAugSplit({ tasks }: { tasks: TaskMatrixPoint[] }) {
  // Get latest era snapshot with auto/aug data for each task
  const taskBars = useMemo(() => {
    return tasks
      .map(t => {
        // Find latest snapshot with automation data
        const sorted = [...t.era_snapshots].sort((a, b) => (ERA_ORDER[b.model_era] ?? 0) - (ERA_ORDER[a.model_era] ?? 0));
        const snap = sorted.find(s => s.automation_pct != null || s.augmentation_pct != null);
        const autoPct = snap?.automation_pct ?? 0;
        const augPct = snap?.augmentation_pct ?? 0;
        const total = autoPct + augPct;
        return {
          taskText: t.task_text,
          autoPct,
          augPct,
          total,
          autoFrac: total > 0 ? autoPct / total : 0,
          augFrac: total > 0 ? augPct / total : 0,
          hasData: snap != null && total > 0,
        };
      })
      .filter(t => t.hasData)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [tasks]);

  if (taskBars.length === 0) {
    return (
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#A1A1AA", letterSpacing: 0.8, marginBottom: 8, fontFamily: "Inter, system-ui, sans-serif" }}>
          AUTOMATION vs AUGMENTATION
        </div>
        <div style={{ fontSize: 12, color: "#A1A1AA", fontFamily: "Inter, system-ui, sans-serif" }}>
          No automation/augmentation breakdown available for this occupation&apos;s model eras.
        </div>
      </div>
    );
  }

  const maxBar = 300;

  return (
    <div style={{ flex: 1 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#A1A1AA", letterSpacing: 0.8, fontFamily: "Inter, system-ui, sans-serif" }}>
          AUTOMATION vs AUGMENTATION
        </div>
        <div style={{ fontSize: 12, color: "#71717A", marginTop: 2, fontFamily: "Inter, system-ui, sans-serif" }}>
          How AI assists per task — full automation vs human-in-the-loop
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {taskBars.map(bar => (
          <div key={bar.taskText} style={{ display: "flex", alignItems: "center", gap: 6, height: 28 }}>
            <div style={{
              width: 140, flexShrink: 0, fontSize: 11, color: "#52525B",
              fontFamily: "Inter, system-ui, sans-serif",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {bar.taskText}
            </div>
            <div style={{ display: "flex", gap: 1, flex: 1 }}>
              <div style={{
                width: `${bar.autoFrac * 100}%`, maxWidth: maxBar * bar.autoFrac,
                height: 16, backgroundColor: AEI_COLORS.automation, borderRadius: "3px 0 0 3px",
                minWidth: bar.autoFrac > 0 ? 4 : 0,
              }} />
              <div style={{
                width: `${bar.augFrac * 100}%`, maxWidth: maxBar * bar.augFrac,
                height: 16, backgroundColor: AEI_COLORS.augmentation, borderRadius: "0 3px 3px 0",
                minWidth: bar.augFrac > 0 ? 4 : 0,
              }} />
            </div>
            <span style={{ fontSize: 10, color: "#71717A", fontFamily: "Inter, system-ui, sans-serif", flexShrink: 0, minWidth: 70, textAlign: "right" }}>
              {Math.round(bar.autoFrac * 100)}% / {Math.round(bar.augFrac * 100)}%
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: AEI_COLORS.automation }} />
          <span style={{ fontSize: 10, color: "#71717A", fontFamily: "Inter, system-ui, sans-serif" }}>Full automation</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: AEI_COLORS.augmentation }} />
          <span style={{ fontSize: 10, color: "#71717A", fontFamily: "Inter, system-ui, sans-serif" }}>Human-in-the-loop</span>
        </div>
      </div>
    </div>
  );
}

// ── Coverage Ring ──

function CoverageRing({ tracked, total, tasks }: { tracked: number; total: number; tasks: TaskMatrixPoint[] }) {
  const pct = total > 0 ? Math.round((tracked / total) * 100) : 0;

  // Count trends from era snapshots
  const trends = useMemo(() => {
    let growing = 0, stable = 0, declining = 0;
    for (const t of tasks) {
      if (t.era_snapshots.length < 2) { stable++; continue; }
      const sorted = [...t.era_snapshots].sort((a, b) => (ERA_ORDER[a.model_era] ?? 0) - (ERA_ORDER[b.model_era] ?? 0));
      const first = sorted[0].task_pct;
      const last = sorted[sorted.length - 1].task_pct;
      const delta = last - first;
      if (delta > 0.005) growing++;
      else if (delta < -0.005) declining++;
      else stable++;
    }
    return { growing, stable, declining };
  }, [tasks]);

  const size = 120;
  const cx = size / 2, cy = size / 2;
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const arcLen = (pct / 100) * circumference;

  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#A1A1AA", letterSpacing: 0.8, marginBottom: 8, fontFamily: "Inter, system-ui, sans-serif", textAlign: "center" }}>
        AEI COVERAGE
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <svg width={size} height={size}>
          {/* Background ring */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E4E4E7" strokeWidth={10} />
          {/* Coverage arc */}
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke={AEI_COLORS.primary} strokeWidth={10}
            strokeDasharray={`${arcLen} ${circumference - arcLen}`}
            strokeDashoffset={circumference * 0.25}
            strokeLinecap="round"
          />
          {/* Center text */}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={22} fontWeight={700} fill={AEI_COLORS.primary} fontFamily="Inter, system-ui, sans-serif">
            {pct}%
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#71717A" fontFamily="Inter, system-ui, sans-serif">
            tracked
          </text>
        </svg>

        {/* Detail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "#52525B", fontFamily: "Inter, system-ui, sans-serif" }}>
            {tracked} of {total} tasks have AEI data
          </div>
          {total - tracked > 0 && (
            <div style={{ fontSize: 10, color: "#A1A1AA", fontFamily: "Inter, system-ui, sans-serif" }}>
              {total - tracked} tasks untracked (no usage signal)
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
            <TrendDot color={AEI_COLORS.growing} label={`${trends.growing} growing`} />
            <TrendDot color={AEI_COLORS.stable} label={`${trends.stable} stable`} />
            <TrendDot color={AEI_COLORS.declining} label={`${trends.declining} declining`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <span style={{ fontSize: 10, color: "#52525B", fontFamily: "Inter, system-ui, sans-serif" }}>{label}</span>
    </div>
  );
}
