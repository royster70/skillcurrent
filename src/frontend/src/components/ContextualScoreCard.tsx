/** Score card with percentile bar, predicted/measured tags, temporal sparkline, and source explainer. */

import { useState } from "react";
import { Link } from "react-router-dom";
import type { OccupationEraSnapshot } from "../lib/api";
import { THEME, TYPE } from "../lib/constants";

const t = THEME.light;

interface ContextualScoreCardProps {
  label: string;
  value: number | null;
  percentile: number | null;
  median: number | null;
  population: number | null;
  /** The card's own signal identity (SIGNAL_COLORS.eloundou/microsoft/aei/...) —
   * used only as a fallback when no percentile context exists yet. This is a
   * per-SOURCE colour, never a ZONE_COLORS value: this card shows one signal's
   * reading, not an exposure zone. */
  signalColor: string;
  sourceKey: "eloundou" | "microsoft" | "aei";
  eraSnapshots?: OccupationEraSnapshot[];
}

const SOURCE_EXPLAINERS: Record<string, { title: string; plain: string; measures: string; kind: "predicted" | "measured"; period: string }> = {
  eloundou: {
    title: "Eloundou Exposure Score",
    plain: "Researchers looked at every task in this job and asked: \"Could AI help with this?\" This score shows how much of the job could potentially be changed by AI — not whether it is being changed, just whether it could be.",
    measures: "Theoretical AI capability based on task analysis (GPT-4 + human raters, 2024 research)",
    kind: "predicted",
    period: "Single assessment (2024)",
  },
  microsoft: {
    title: "Microsoft AI Applicability",
    plain: "Microsoft tracked how people actually use AI tools like Copilot at work. This score shows how applicable AI is to this job's daily activities — based on real usage data, not theory.",
    measures: "Empirical AI applicability from Microsoft 365 Copilot usage (Jan–Sept 2024)",
    kind: "measured",
    period: "Jan–Sept 2024",
  },
  aei: {
    title: "Anthropic Economic Index",
    plain: "This measures how much people in this job are actually asking AI (Claude) for help right now. A high score means workers in this role are already using AI regularly in their work.",
    measures: "Empirical AI usage from real Claude conversations (Anthropic, 2024)",
    kind: "measured",
    period: "4 model generations",
  },
};

// Percentile-extremity shading — its own scale, orthogonal to zone/signal colour
// (this answers "how unusual is this reading", not "which source" or "which zone").
function percentileColor(pct: number): string {
  if (pct >= 90) return "#b23b3b";
  if (pct >= 75) return t.brass;
  if (pct >= 50) return "#9c8a14";
  if (pct >= 25) return t.current;
  return "#0d8f6e";
}

function percentileLabel(pct: number): string {
  if (pct >= 90) return "Very high exposure";
  if (pct >= 75) return "Above average";
  if (pct >= 50) return "Average";
  if (pct >= 25) return "Below average";
  return "Very low exposure";
}

/** Mini sparkline for occupation-level AEI trend across model eras. */
function EraSparkline({ snapshots }: { snapshots: OccupationEraSnapshot[] }) {
  if (snapshots.length < 2) return null;

  const values = snapshots.map(s => s.avg_task_pct);
  const max = Math.max(...values, 0.01);
  const width = 80;
  const height = 20;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - (v / max) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(" ");

  const isGrowing = values[values.length - 1] > values[0] + 0.001;
  const color = isGrowing ? "#b23b3b" : t.inkMuted;
  const firstEra = snapshots[0].model_era.replace("sonnet-", "");
  const lastEra = snapshots[snapshots.length - 1].model_era.replace("sonnet-", "");

  return (
    <div style={{ marginTop: 4 }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
        <circle
          cx={width}
          cy={height - (values[values.length - 1] / max) * (height - 2) - 1}
          r={2} fill={color}
        />
      </svg>
      <div style={{ fontSize: 9, color: t.inkMuted, marginTop: 1, fontFamily: TYPE.mono }}>
        {firstEra} {"→"} {lastEra}
        <span style={{ color, fontWeight: 600 }}> {isGrowing ? "↑" : "→"}</span>
      </div>
    </div>
  );
}

export function ContextualScoreCard({ label, value, percentile, median, population, signalColor, sourceKey, eraSnapshots }: ContextualScoreCardProps) {
  const [showExplainer, setShowExplainer] = useState(false);
  const hasContext = percentile != null && population != null;
  const color = hasContext ? percentileColor(percentile) : signalColor;
  const explainer = SOURCE_EXPLAINERS[sourceKey];
  const isPredicted = explainer.kind === "predicted";

  return (
    <div style={{
      flex: 1, padding: "10px 14px", borderRadius: 8, minWidth: 130, position: "relative",
      border: `1px ${isPredicted ? "dashed" : "solid"} ${color}30`,
      backgroundColor: `${color}08`,
      fontFamily: TYPE.body,
    }}>
      {/* Label row with kind tag and info button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 11, color: t.inkMuted, fontWeight: 500 }}>{label}</div>
          <span style={{
            fontSize: 8, fontWeight: 600, padding: "1px 4px", borderRadius: 3,
            backgroundColor: isPredicted ? "#f3eefa" : "#e6f2ee",
            color: isPredicted ? "#6b3fa0" : "#0d8f6e",
            border: `1px ${isPredicted ? "dashed" : "solid"} ${isPredicted ? "#6b3fa030" : "#0d8f6e30"}`,
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            {isPredicted ? "Predicted" : "Measured"}
          </span>
        </div>
        <button
          onClick={() => setShowExplainer(!showExplainer)}
          style={{
            width: 16, height: 16, borderRadius: "50%", border: `1px solid ${t.line}`,
            backgroundColor: showExplainer ? t.brass : t.ground,
            color: showExplainer ? "#fff" : t.inkMuted,
            fontSize: 10, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, lineHeight: 1,
          }}
          title={explainer.title}
        >
          ?
        </button>
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: TYPE.mono }}>
        {value != null ? value.toFixed(3) : "—"}
      </div>

      {hasContext && (
        <>
          {/* Percentile distribution bar */}
          <div style={{ position: "relative", height: 6, marginTop: 6, borderRadius: 3, backgroundColor: t.line }}>
            <div style={{ position: "absolute", left: "25%", top: -1, width: 1, height: 8, backgroundColor: t.inkMuted }} />
            <div style={{ position: "absolute", left: "75%", top: -1, width: 1, height: 8, backgroundColor: t.inkMuted }} />
            <div style={{
              position: "absolute",
              left: `${Math.max(2, Math.min(98, percentile))}%`,
              top: -2, width: 10, height: 10, borderRadius: "50%",
              backgroundColor: color, border: `2px solid ${t.surface}`,
              boxShadow: "0 0 2px rgba(0,0,0,0.3)", transform: "translateX(-5px)",
            }} />
          </div>

          {/* Interpretive label */}
          <div style={{ fontSize: 10, color: t.inkMuted, marginTop: 4, lineHeight: 1.3 }}>
            <span style={{ fontWeight: 600, color }}>{percentileLabel(percentile)}</span>
            {" · P"}{percentile}{" of "}{population}
            {median != null && (
              <span> {"·"} med {median.toFixed(3)}</span>
            )}
          </div>
        </>
      )}

      {/* Era sparkline (AEI only) or temporal period label */}
      {eraSnapshots && eraSnapshots.length >= 2 ? (
        <EraSparkline snapshots={eraSnapshots} />
      ) : (
        <div style={{ fontSize: 9, color: t.inkMuted, marginTop: 4 }}>
          {explainer.period}
        </div>
      )}

      {/* Explainer popover */}
      {showExplainer && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
          marginTop: 4, padding: "10px 12px", borderRadius: 8,
          backgroundColor: t.surface, border: `1px solid ${t.line}`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          minWidth: 220,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.ink, marginBottom: 4 }}>
            {explainer.title}
          </div>
          <div style={{ fontSize: 11, color: t.inkMuted, lineHeight: 1.5, marginBottom: 6 }}>
            {explainer.plain}
          </div>
          <div style={{ fontSize: 10, color: t.inkMuted, lineHeight: 1.4, fontStyle: "italic" }}>
            {explainer.measures}
          </div>
          {/* Deep link into the methodology's predicted-vs-measured section —
              the "Explain this score" drill-down home (#79). */}
          <Link
            to="/methodology#observed-vs-theoretical"
            style={{ display: "inline-block", marginTop: 6, fontSize: 10.5, fontWeight: 600, color: t.brass, textDecoration: "none" }}
          >
            How these signals differ →
          </Link>
        </div>
      )}
    </div>
  );
}
