/**
 * GDPval Benchmark Panel — collapsible panel showing benchmark detail
 * for occupations with GDPval real-world task evaluations.
 *
 * Three custom SVG visualizations:
 *  1. Score Range Chart (dumbbell) — min/max score per task
 *  2. Rubric Composition Ring (donut) — required vs optional, reward vs penalty
 *  3. Tag Frequency Bars — top evaluation categories (conditional)
 */

import { useState, useMemo } from "react";
import { useApi } from "../hooks/useApi";
import { api, type GDPvalOccupationResponse, type GDPvalTaskDetail } from "../lib/api";
import { GDPVAL_COLORS } from "../lib/constants";

interface Props {
  socCode: string;
  taskCount: number;
  expanded: boolean;
  onToggle: () => void;
}

export function GDPvalBenchmarkPanel({ socCode, expanded, taskCount, onToggle }: Props) {
  const { data, loading } = useApi(
    () => expanded ? api.gdpvalOccupation(socCode) : Promise.resolve(null as unknown as GDPvalOccupationResponse),
    [socCode, expanded],
  );

  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${GDPVAL_COLORS.border}`,
      overflow: "hidden",
      transition: "all 0.3s ease",
    }}>
      {/* Header — always visible */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 20px",
          backgroundColor: GDPVAL_COLORS.bg,
          borderBottom: expanded ? `1px solid ${GDPVAL_COLORS.border}40` : "none",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={GDPVAL_COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={12} cy={12} r={10} />
            <circle cx={12} cy={12} r={6} />
            <circle cx={12} cy={12} r={2} />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: GDPVAL_COLORS.primary, fontFamily: "Inter, system-ui, sans-serif" }}>
            GDPval Benchmark
          </span>
          <span style={{ fontSize: 13, color: GDPVAL_COLORS.dark, fontFamily: "Inter, system-ui, sans-serif" }}>
            &middot; {taskCount} real-world tasks
          </span>
        </div>
        <svg
          width={16} height={16} viewBox="0 0 24 24" fill="none"
          stroke={GDPVAL_COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s ease" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Body — collapsible */}
      <div style={{
        maxHeight: expanded ? 800 : 0,
        overflow: "hidden",
        transition: "max-height 0.3s ease",
      }}>
        {expanded && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
            {loading && (
              <div style={{ padding: 24, textAlign: "center", color: "#A1A1AA", fontSize: 13, fontFamily: "Inter, system-ui, sans-serif" }}>
                Loading benchmark data...
              </div>
            )}
            {data && <PanelContent data={data} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Panel Content ──

function PanelContent({ data }: { data: GDPvalOccupationResponse }) {
  const agg = useMemo(() => aggregateRubrics(data.tasks), [data.tasks]);

  return (
    <>
      <ScoreRangeChart tasks={data.tasks} />
      <div style={{ display: "flex", gap: 24 }}>
        <RubricCompositionRing agg={agg} />
        {agg.tagCounts.length > 0 && <TagFrequencyBars tags={agg.tagCounts} maxCount={agg.tagCounts[0]?.count ?? 1} />}
      </div>
    </>
  );
}

// ── Aggregation ──

interface RubricAggregation {
  totalCriteria: number;
  requiredCount: number;
  optionalCount: number;
  rewardCount: number;
  penaltyCount: number;
  tagCounts: { tag: string; count: number }[];
}

function aggregateRubrics(tasks: GDPvalTaskDetail[]): RubricAggregation {
  let required = 0, optional = 0, reward = 0, penalty = 0;
  const tagMap = new Map<string, number>();

  for (const task of tasks) {
    for (const item of task.rubric_items) {
      if (item.required) required++; else optional++;
      if (item.score > 0) reward++; else if (item.score < 0) penalty++;
      if (item.tags) {
        for (const tag of item.tags) {
          // Skip boolean-like tags that carry no descriptive value
          if (tag === "true" || tag === "false") continue;
          tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
        }
      }
    }
  }

  const tagCounts = [...tagMap.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalCriteria: required + optional,
    requiredCount: required,
    optionalCount: optional,
    rewardCount: reward,
    penaltyCount: penalty,
    tagCounts,
  };
}

// ── Score Range Chart (Dumbbell) ──

function ScoreRangeChart({ tasks }: { tasks: GDPvalTaskDetail[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => (b.max_score ?? 0) - (a.max_score ?? 0)),
    [tasks],
  );

  // Scale: find the absolute extremes
  const allMin = Math.min(...sorted.map(t => t.min_score ?? 0), 0);
  const allMax = Math.max(...sorted.map(t => t.max_score ?? 1), 1);
  const range = allMax - allMin || 1;

  const chartWidth = 400;
  const labelWidth = 280;
  const rowHeight = 36;

  const toX = (score: number) => ((score - allMin) / range) * chartWidth;
  const zeroX = toX(0);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#A1A1AA", letterSpacing: 0.8, fontFamily: "Inter, system-ui, sans-serif" }}>
          TASK SCORE RANGES
        </div>
        <div style={{ fontSize: 12, color: "#71717A", marginTop: 2, fontFamily: "Inter, system-ui, sans-serif" }}>
          Min (penalty) to max (reward) scoring range per benchmark task
        </div>
      </div>

      {sorted.map((task, i) => {
        const minScore = task.min_score ?? 0;
        const maxScore = task.max_score ?? 0;
        const x1 = toX(minScore);
        const x2 = toX(maxScore);
        const isHovered = hoveredIdx === i;

        return (
          <div
            key={task.task_id}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              display: "flex", alignItems: "center", height: rowHeight,
              backgroundColor: isHovered ? GDPVAL_COLORS.bg : i % 2 === 1 ? "#FAFAFA" : "transparent",
              transition: "background-color 0.15s",
              position: "relative",
            }}
          >
            <div style={{
              width: labelWidth, flexShrink: 0, fontSize: 11, color: "#52525B",
              fontFamily: "Inter, system-ui, sans-serif",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              paddingRight: 12,
            }}>
              {task.prompt_summary}
            </div>
            <svg width={chartWidth + 50} height={rowHeight} style={{ flexShrink: 0 }}>
              {/* Zero reference line */}
              <line x1={zeroX} y1={4} x2={zeroX} y2={rowHeight - 4} stroke="#E4E4E7" strokeWidth={1} strokeDasharray="3,3" />
              {/* Range line */}
              <line x1={x1} y1={rowHeight / 2} x2={x2} y2={rowHeight / 2} stroke={GDPVAL_COLORS.border} strokeWidth={2} />
              {/* Min dot (penalty) */}
              <circle cx={x1} cy={rowHeight / 2} r={4} fill={GDPVAL_COLORS.penalty} />
              {/* Max dot (reward) */}
              <circle cx={x2} cy={rowHeight / 2} r={5} fill={GDPVAL_COLORS.reward} />
              {/* Score label */}
              <text x={x2 + 10} y={rowHeight / 2 + 4} fontSize={10} fontWeight={600} fill={GDPVAL_COLORS.reward} fontFamily="Inter, system-ui, sans-serif">
                +{maxScore}
              </text>
            </svg>

            {/* Hover tooltip */}
            {isHovered && (
              <div style={{
                position: "absolute", left: labelWidth + 10, top: rowHeight,
                zIndex: 10, backgroundColor: "#fff", border: "1px solid #E4E4E7",
                borderRadius: 8, padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                maxWidth: 360, fontSize: 12, lineHeight: 1.5, color: "#52525B",
                fontFamily: "Inter, system-ui, sans-serif",
              }}>
                <div style={{ fontWeight: 600, color: "#18181B", marginBottom: 4 }}>{task.prompt_summary}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#71717A" }}>
                  <span>{task.rubric_item_count} criteria</span>
                  <span style={{ color: GDPVAL_COLORS.reward }}>max: +{maxScore}</span>
                  <span style={{ color: GDPVAL_COLORS.penalty }}>min: {minScore}</span>
                  {task.reference_file_count > 0 && <span>{task.reference_file_count} ref files</span>}
                  {task.deliverable_file_count > 0 && <span>{task.deliverable_file_count} deliverables</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center" }}>
        <LegendItem color={GDPVAL_COLORS.penalty} label="Penalty (min)" />
        <LegendItem color={GDPVAL_COLORS.reward} label="Reward (max)" />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ width: 20, height: 2, backgroundColor: GDPVAL_COLORS.border, borderRadius: 1 }} />
          <span style={{ fontSize: 10, color: "#71717A", fontFamily: "Inter, system-ui, sans-serif" }}>Score range</span>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <span style={{ fontSize: 10, color: "#71717A", fontFamily: "Inter, system-ui, sans-serif" }}>{label}</span>
    </div>
  );
}

// ── Rubric Composition Ring (Donut) ──

function RubricCompositionRing({ agg }: { agg: RubricAggregation }) {
  const { totalCriteria, requiredCount, optionalCount, rewardCount, penaltyCount } = agg;
  if (totalCriteria === 0) return null;

  const size = 140;
  const cx = size / 2, cy = size / 2;

  // Outer ring: reward vs penalty (more universally informative than required/optional)
  const outerR = 56, outerW = 12;
  const rewardPct = rewardCount / (rewardCount + penaltyCount || 1);

  // Inner ring: required vs optional (when data has both)
  const innerR = 38, innerW = 10;
  const hasRequiredData = requiredCount > 0;
  const reqPct = hasRequiredData ? requiredCount / totalCriteria : 0;

  return (
    <div style={{ width: 200, flexShrink: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#A1A1AA", letterSpacing: 0.8, marginBottom: 8, fontFamily: "Inter, system-ui, sans-serif" }}>
        RUBRIC COMPOSITION
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <svg width={size} height={size}>
          {/* Outer ring background (penalty) */}
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#FEE2E2" strokeWidth={outerW} />
          {/* Outer ring: reward portion */}
          <circle
            cx={cx} cy={cy} r={outerR} fill="none"
            stroke={GDPVAL_COLORS.reward} strokeWidth={outerW}
            strokeDasharray={`${rewardPct * 2 * Math.PI * outerR} ${(1 - rewardPct) * 2 * Math.PI * outerR}`}
            strokeDashoffset={2 * Math.PI * outerR * 0.25}
            strokeLinecap="round"
          />
          {/* Inner ring: required/optional (only when data has both) */}
          {hasRequiredData && (
            <>
              <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={GDPVAL_COLORS.border} strokeWidth={innerW} opacity={0.4} />
              <circle
                cx={cx} cy={cy} r={innerR} fill="none"
                stroke={GDPVAL_COLORS.primary} strokeWidth={innerW}
                strokeDasharray={`${reqPct * 2 * Math.PI * innerR} ${(1 - reqPct) * 2 * Math.PI * innerR}`}
                strokeDashoffset={2 * Math.PI * innerR * 0.25}
                strokeLinecap="round"
              />
            </>
          )}
          {/* Center text */}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={20} fontWeight={700} fill="#18181B" fontFamily="Inter, system-ui, sans-serif">
            {totalCriteria}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#71717A" fontFamily="Inter, system-ui, sans-serif">
            criteria
          </text>
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
          <RingLegendItem color={GDPVAL_COLORS.reward} label={`Reward items (${pct(rewardCount, rewardCount + penaltyCount)})`} />
          <RingLegendItem color={GDPVAL_COLORS.penalty} label={`Penalty items (${pct(penaltyCount, rewardCount + penaltyCount)})`} />
          {hasRequiredData && (
            <>
              <RingLegendItem color={GDPVAL_COLORS.primary} label={`Required (${pct(requiredCount, totalCriteria)})`} />
              <RingLegendItem color={GDPVAL_COLORS.border} label={`Optional (${pct(optionalCount, totalCriteria)})`} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RingLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "#52525B", fontFamily: "Inter, system-ui, sans-serif" }}>{label}</span>
    </div>
  );
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

// ── Tag Frequency Bars ──

function TagFrequencyBars({ tags, maxCount }: { tags: { tag: string; count: number }[]; maxCount: number }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#A1A1AA", letterSpacing: 0.8, marginBottom: 8, fontFamily: "Inter, system-ui, sans-serif" }}>
        EVALUATION CATEGORIES
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tags.map(({ tag, count }) => (
          <div key={tag} style={{ display: "flex", alignItems: "center", gap: 8, height: 24 }}>
            <div style={{
              width: 120, flexShrink: 0, fontSize: 11, color: "#52525B",
              fontFamily: "Inter, system-ui, sans-serif",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {tag}
            </div>
            <div style={{ flex: 1, height: 14, backgroundColor: GDPVAL_COLORS.bg, borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                width: `${(count / maxCount) * 100}%`,
                height: "100%",
                backgroundColor: GDPVAL_COLORS.border,
                borderRadius: 3,
                transition: "width 0.3s ease",
              }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#71717A", fontFamily: "Inter, system-ui, sans-serif", minWidth: 24, textAlign: "right" }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
