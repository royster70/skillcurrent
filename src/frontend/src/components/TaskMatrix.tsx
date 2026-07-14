/**
 * TaskWaterline — an occupation's tasks placed on the shared exposure scale.
 *
 * This is the full-scale, live version of the landing page's worked example
 * (ZoneExplorer → MiniBetaTrack): the same horizontal Beta instrument, the same
 * E0/E1/E2 bands, the same zone colours — but every real task of the role, plus
 * the temporal "current" (AI *usage* trend across model eras) that the static
 * landing example can't carry.
 *
 * Design conventions (brand brief): zone hues (ZONE_COLORS) are FIXED meaning on
 * the exposure axis — never decorative. `current` (teal) is reserved for motion:
 * here it marks tasks the current is moving *into* (rising usage). Importance is
 * the second dimension, carried by dot size, not a second axis — the whole app
 * reads exposure left→right, and this stays consistent with that.
 */

import { useMemo, useState } from "react";
import type { TaskMatrixResponse, TaskMatrixPoint, GDPvalTaskDetail } from "../lib/api";
import {
  THEME, TYPE, ZONE_COLORS, ZONE_BG, ZONE_LABELS,
  BETA_SCALE, ZONE_THRESHOLDS, GDPVAL_COLORS,
} from "../lib/constants";

const t = THEME.light;

type ZoneKey = "E0" | "E1" | "E2";
type SortKey = "exposure" | "importance" | "movement";
type TrendKind = "rising" | "steady" | "falling" | "unknown";

function zoneOf(beta: number): ZoneKey {
  if (beta >= ZONE_THRESHOLDS.E2) return "E2";
  if (beta >= ZONE_THRESHOLDS.E1) return "E1";
  return "E0";
}

const pctOfScale = (v: number) => Math.max(0, Math.min(100, (v / BETA_SCALE.max) * 100));

interface Row {
  taskId: number;
  text: string;
  beta: number;
  zone: ZoneKey;
  importance: number | null;
  trend: TrendKind;
  velocity: number | null;
  drift: string | null;
  latestPct: number | null;
}

function trendOf(task: TaskMatrixPoint): TrendKind {
  const s = task.era_snapshots;
  if (s.length < 2) return "unknown";
  const delta = s[s.length - 1].task_pct - s[0].task_pct;
  if (delta > 0.02) return "rising";
  if (delta < -0.02) return "falling";
  return "steady";
}

// Importance (1–5) → dot radius. Null importance falls to the middle.
const dotRadius = (imp: number | null) => (imp == null ? 6 : 4 + ((imp - 1) / 4) * 5);

interface TaskMatrixProps {
  data: TaskMatrixResponse;
  highlightedTaskId?: number | null;
  gdpvalTasks?: GDPvalTaskDetail[] | null;
  onRequestGdpval?: () => void;
}

export function TaskWaterline({ data, highlightedTaskId, gdpvalTasks, onRequestGdpval }: TaskMatrixProps) {
  const [sort, setSort] = useState<SortKey>("exposure");
  const [showCurrent, setShowCurrent] = useState(true);
  const [showGdpval, setShowGdpval] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const raw = data.tasks
      .map((task): Row => {
        const beta = task.eloundou_dwa_beta ?? task.automation_potential ?? 0;
        const latest = task.era_snapshots.at(-1)?.task_pct ?? null;
        return {
          taskId: task.task_id,
          text: task.task_text,
          beta,
          zone: zoneOf(beta),
          importance: task.importance,
          trend: trendOf(task),
          velocity: task.drift_velocity,
          drift: task.drift_classification,
          latestPct: latest,
        };
      });
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      exposure: (a, b) => b.beta - a.beta,
      importance: (a, b) => (b.importance ?? 0) - (a.importance ?? 0),
      movement: (a, b) => (b.velocity ?? 0) - (a.velocity ?? 0),
    };
    return raw.sort(cmp[sort]);
  }, [data.tasks, sort]);

  const zoneCounts = useMemo(() => {
    const c: Record<ZoneKey, number> = { E0: 0, E1: 0, E2: 0 };
    rows.forEach((r) => { c[r.zone] += 1; });
    return c;
  }, [rows]);

  const risingCount = rows.filter((r) => r.trend === "rising").length;
  const hasEras = data.available_eras.length >= 2;

  return (
    <div style={{ background: t.surface, borderRadius: 12, border: `1.5px solid ${t.line}`, padding: 20, fontFamily: TYPE.body, color: t.ink }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: TYPE.display, fontSize: 18, fontWeight: 600 }}>Task waterline</div>
          <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 2, maxWidth: 460, lineHeight: 1.4 }}>
            Every task placed on the exposure scale. What sits below the waterline is
            already doable by AI; the dry end stays distinctly human.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <SortToggle sort={sort} onChange={setSort} />
        </div>
      </div>

      {/* Zone summary — the shape of the role */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {(["E0", "E1", "E2"] as ZoneKey[]).map((z) => (
          <div key={z} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 8,
            background: ZONE_BG[z], border: `1px solid ${ZONE_COLORS[z]}33`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ZONE_COLORS[z] }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: ZONE_COLORS[z] }}>{zoneCounts[z]}</span>
            <span style={{ fontSize: 11.5, color: t.inkMuted }}>{ZONE_LABELS[z]}</span>
          </div>
        ))}
        {hasEras && (
          <button
            onClick={() => setShowCurrent((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6, marginLeft: "auto",
              padding: "4px 10px", borderRadius: 8, cursor: "pointer",
              background: showCurrent ? `${t.current}18` : "transparent",
              border: `1px solid ${showCurrent ? t.current : t.line}`,
              color: showCurrent ? t.current : t.inkMuted, fontSize: 11.5, fontWeight: 500,
            }}
          >
            <CurrentGlyph trend="rising" active={showCurrent} />
            {showCurrent ? "Current: on" : "Current: off"}
            {showCurrent && risingCount > 0 && (
              <span style={{ fontFamily: TYPE.mono }}>· {risingCount} rising</span>
            )}
          </button>
        )}
      </div>

      {/* Scale calibration header — reads once, every row aligns to it */}
      <ScaleHeader />

      {/* Task rows */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r) => (
          <TaskRow
            key={r.taskId}
            row={r}
            showCurrent={showCurrent && hasEras}
            highlighted={highlightedTaskId === r.taskId}
            dimmed={highlightedTaskId != null && highlightedTaskId !== r.taskId}
          />
        ))}
      </div>

      {/* GDPval — independent benchmark signal (opt-in) */}
      {data.gdpval_benchmark_count > 0 && (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => {
              const next = !showGdpval;
              setShowGdpval(next);
              if (next && onRequestGdpval) onRequestGdpval();
            }}
            style={{
              padding: "5px 12px", borderRadius: 8, cursor: "pointer",
              background: showGdpval ? GDPVAL_COLORS.bg : "transparent",
              border: `1px solid ${showGdpval ? GDPVAL_COLORS.border : t.line}`,
              color: GDPVAL_COLORS.primary, fontSize: 11.5, fontWeight: 500,
            }}
          >
            {showGdpval ? "Hide" : "Show"} GDPval benchmark ({data.gdpval_benchmark_count})
          </button>
          {showGdpval && <GDPvalOverlayStrip benchmarkCount={data.gdpval_benchmark_count} tasks={gdpvalTasks ?? null} />}
        </div>
      )}
    </div>
  );
}

// Keep the old name as an alias so existing imports keep working.
export const TaskMatrix = TaskWaterline;

// ── Sort control ──

function SortToggle({ sort, onChange }: { sort: SortKey; onChange: (s: SortKey) => void }) {
  const opts: { key: SortKey; label: string }[] = [
    { key: "exposure", label: "Exposure" },
    { key: "importance", label: "Importance" },
    { key: "movement", label: "Movement" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: t.inkMuted }}>Sort</span>
      <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${t.line}`, overflow: "hidden" }}>
        {opts.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              padding: "5px 11px", fontSize: 11, border: "none", cursor: "pointer",
              fontWeight: sort === o.key ? 600 : 400,
              background: sort === o.key ? t.brass : t.surface,
              color: sort === o.key ? "#fff" : t.inkMuted,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Shared geometry: task text | track | value ──
const GRID = "1fr clamp(140px, 34%, 260px) 52px";

function ScaleHeader() {
  const e1 = pctOfScale(ZONE_THRESHOLDS.E1);
  const e2 = pctOfScale(ZONE_THRESHOLDS.E2);
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "end", paddingBottom: 6, marginBottom: 4, borderBottom: `1px solid ${t.line}` }}>
      <div style={{ fontSize: 10.5, color: t.inkMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>Task</div>
      <div style={{ position: "relative", height: 26 }}>
        {/* band labels */}
        <div style={{ position: "absolute", inset: 0, display: "flex", fontSize: 9.5, fontWeight: 600 }}>
          <div style={{ width: `${e1}%`, color: ZONE_COLORS.E0 }}>{ZONE_LABELS.E0}</div>
          <div style={{ width: `${e2 - e1}%`, color: ZONE_COLORS.E1, textAlign: "center" }}>{ZONE_LABELS.E1}</div>
          <div style={{ width: `${100 - e2}%`, color: ZONE_COLORS.E2, textAlign: "right" }}>{ZONE_LABELS.E2}</div>
        </div>
        {/* threshold ticks */}
        <div style={{ position: "absolute", left: `${e1}%`, bottom: 0, fontSize: 9, color: t.inkMuted, transform: "translateX(-50%)", fontFamily: TYPE.mono }}>
          {ZONE_THRESHOLDS.E1.toFixed(2)}
        </div>
        <div style={{ position: "absolute", left: `${e2}%`, bottom: 0, fontSize: 9, color: t.inkMuted, transform: "translateX(-50%)", fontFamily: TYPE.mono }}>
          {ZONE_THRESHOLDS.E2.toFixed(2)}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: t.inkMuted, textAlign: "right", textTransform: "uppercase", letterSpacing: 0.4 }}>β</div>
    </div>
  );
}

function TaskRow({ row, showCurrent, highlighted, dimmed }: { row: Row; showCurrent: boolean; highlighted: boolean; dimmed: boolean }) {
  const zoneColor = ZONE_COLORS[row.zone];
  return (
    <div style={{
      display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "center",
      padding: "9px 6px", borderBottom: `1px solid ${t.line}`,
      borderRadius: 6, background: highlighted ? `${zoneColor}12` : "transparent",
      opacity: dimmed ? 0.4 : 1, transition: "opacity 0.15s, background 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, lineHeight: 1.35, fontWeight: highlighted ? 600 : 400 }}>{row.text}</span>
        {showCurrent && row.trend !== "steady" && row.trend !== "unknown" && (
          <CurrentGlyph trend={row.trend} active />
        )}
        {row.drift === "departing" && (
          <span
            title="AI usage of this task is rising across model eras"
            style={{ fontSize: 9, fontFamily: TYPE.mono, color: t.current, whiteSpace: "nowrap" }}
          >
            rising
          </span>
        )}
      </div>
      <BetaTrack beta={row.beta} zone={row.zone} importance={row.importance} highlighted={highlighted} />
      <span style={{ textAlign: "right", fontFamily: TYPE.mono, fontSize: 12.5, fontWeight: 600, color: zoneColor }}>
        {row.beta.toFixed(2)}
      </span>
    </div>
  );
}

function BetaTrack({ beta, zone, importance, highlighted }: { beta: number; zone: ZoneKey; importance: number | null; highlighted: boolean }) {
  const e1 = pctOfScale(ZONE_THRESHOLDS.E1);
  const e2 = pctOfScale(ZONE_THRESHOLDS.E2);
  const r = dotRadius(importance) + (highlighted ? 2 : 0);
  const zoneColor = ZONE_COLORS[zone];
  return (
    <div style={{ position: "relative", height: 12, borderRadius: 6, display: "flex", overflow: "visible", border: `1px solid ${t.line}` }}>
      <div style={{ width: `${e1}%`, background: ZONE_BG.E0, borderRadius: "5px 0 0 5px" }} />
      <div style={{ width: `${e2 - e1}%`, background: ZONE_BG.E1 }} />
      <div style={{ width: `${100 - e2}%`, background: ZONE_BG.E2, borderRadius: "0 5px 5px 0" }} />
      <div
        title={importance != null ? `importance ${importance.toFixed(1)} / 5` : undefined}
        style={{
          position: "absolute", left: `${pctOfScale(beta)}%`, top: "50%",
          width: r * 2, height: r * 2, borderRadius: "50%",
          background: zoneColor, border: `2px solid ${t.surface}`,
          transform: "translate(-50%, -50%)",
          boxShadow: highlighted ? `0 0 0 2px ${zoneColor}` : "none",
        }}
      />
    </div>
  );
}

// ── The "current" glyph — teal, reserved for motion (rising/falling usage) ──

function CurrentGlyph({ trend, active }: { trend: TrendKind; active: boolean }) {
  const color = active ? t.current : t.inkMuted;
  if (trend === "falling") {
    // adoption gap — AI can do it, usage is receding: hollow, downstream
    return (
      <svg width={12} height={12} viewBox="0 0 12 12" aria-label="usage falling" style={{ flexShrink: 0 }}>
        <path d="M6 2 v6 M3.5 6 L6 8.5 L8.5 6" fill="none" stroke={color} strokeWidth={1.4} opacity={0.6} />
      </svg>
    );
  }
  // rising / default — the current moving into the task
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-label="usage rising" style={{ flexShrink: 0 }}>
      <path d="M6 10 v-6 M3.5 6 L6 3.5 L8.5 6" fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  );
}

// ── GDPval Benchmark Strip (independent signal — palette kept until §10 redesign) ──

function GDPvalOverlayStrip({ benchmarkCount, tasks }: { benchmarkCount: number; tasks: GDPvalTaskDetail[] | null }) {
  if (benchmarkCount === 0) return null;
  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 8, backgroundColor: GDPVAL_COLORS.bg, border: `1px solid ${GDPVAL_COLORS.border}` }}>
      <div style={{ fontSize: 12, color: GDPVAL_COLORS.primary, fontWeight: 600, marginBottom: 4 }}>
        GDPval benchmark — {benchmarkCount} real-world tasks
      </div>
      <div style={{ fontSize: 11, color: GDPVAL_COLORS.dark, marginBottom: 8, lineHeight: 1.4 }}>
        Independent, rubric-graded deliverables — not O*NET task statements. These test AI capability on real work products for this occupation.
      </div>
      {!tasks ? (
        <div style={{ fontSize: 11, color: t.inkMuted, fontStyle: "italic" }}>Loading benchmark tasks…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {tasks.map((task) => (
            <div key={task.task_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <span style={{ flex: 1, color: "#52525B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {task.prompt_summary}
              </span>
              <span style={{ fontSize: 9, color: GDPVAL_COLORS.primary, background: `${GDPVAL_COLORS.primary}12`, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
                {task.rubric_item_count} criteria
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
