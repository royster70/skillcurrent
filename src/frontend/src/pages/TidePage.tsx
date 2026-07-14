/**
 * TidePage — "Rising Tide", the product's namesake temporal view (was "Drift
 * Analysis"). Shows how fast AI *usage* is rising through tasks, model era over
 * model era, and which tasks flip zones next.
 *
 * Vocabulary (UI only — API keeps drift_* names): departing → Rising ·
 * enduring → Holding fast · below_threshold → At the waterline · emerging →
 * Surfacing · unclassified → Uncharted. velocity → pace ("+X pts/era");
 * r_squared → trend-confidence words.
 *
 * Honesty (brand brief §9): all movement here is USAGE share (attention),
 * never "automation increasing". Era counts and class mixes are derived from
 * the response, not hardcoded — the /drift API will keep evolving and today's
 * data is sparse (surface Uncharted as a first-class stat, don't hide it).
 */

import { useState, useEffect, type ReactNode } from "react";
import { useApi } from "../hooks/useApi";
import { api, type DriftTask } from "../lib/api";
import { MOVEMENT_COLORS, MOVEMENT_LABELS, ZONE_COLORS, ZONE_BG, THEME, TYPE } from "../lib/constants";
import { ZoneLegend } from "../components/ZoneExplorer";
import { useReveal } from "../components/current/useReveal";
import { DUR, EASE, ensureMotionStyles } from "../components/current/motion";

// Named `theme` (not `t`) — task-map callbacks below use `t` as their loop var.
const theme = THEME.light;

/** The usage share at which a task flips zones. Presentational until the API
 * exposes it — matches the FR-8.3 below-threshold narrative (40–50% → flips
 * at ~50%). Everything else on this page is derived from the response. */
const FLIP_THRESHOLD = 0.5;

const usageOf = (t: DriftTask) => t.latest_task_pct ?? 0;
const paceOf = (t: DriftTask) => t.velocity ?? 0;

const fmtUsage = (u: number) => `${(u * 100).toFixed(0)}%`;
const fmtPace = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} pts/era`;

function confidenceWord(r2: number | null): string {
  if (r2 == null) return "unknown";
  if (r2 >= 0.8) return "high";
  if (r2 >= 0.5) return "medium";
  return "low";
}

/** Eras until a task reaches the flip line at its current pace. */
function erasToLine(t: DriftTask): number | null {
  const v = paceOf(t);
  if (v <= 0) return null;
  return (FLIP_THRESHOLD - usageOf(t)) / v;
}

// ── Small house-style helpers (match the landing's Waypoint/Reveal rhythm) ──

function Waypoint({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: TYPE.mono, fontSize: 11, letterSpacing: 2, color: theme.brass, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const { ref, shown } = useReveal();
  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(10px)",
        transition: `opacity ${DUR.reveal}ms ${EASE} ${delay}ms, transform ${DUR.reveal}ms ${EASE} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/** Stat tile — surface card, mono number (brief §8), quiet label. When given
 * an onClick it doubles as the page's filter chip: click to focus the task
 * list on that movement class, click again to return to all movers. */
function StatTile({ label, value, subtitle, color, alert, active, onClick }: {
  label: string; value: string; subtitle: string; color: string; alert?: boolean;
  active?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      style={{
        flex: "1 1 160px", minWidth: 150, padding: "16px 18px", borderRadius: 12,
        display: "flex", flexDirection: "column", gap: 4, textAlign: "left",
        background: alert ? ZONE_BG.alert : theme.surface,
        border: `1.5px solid ${active ? theme.brass : alert ? `${ZONE_COLORS.alert}40` : theme.line}`,
        boxShadow: active ? `0 0 0 1px ${theme.brass}` : "none",
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
        transition: `border-color ${DUR.hover}ms ${EASE}, box-shadow ${DUR.hover}ms ${EASE}`,
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1, color: active ? theme.brass : theme.inkMuted, textTransform: "uppercase" }}>
        {label}{onClick ? " ▾" : ""}
      </div>
      <div style={{ fontFamily: TYPE.mono, fontSize: 30, fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: theme.inkMuted }}>{subtitle}</div>
    </Tag>
  );
}

// ── The hero: tasks approaching the flip line, sorted by soonest-to-flip ──

function ApproachRow({ task, domain, shown, index, showPace }: {
  task: DriftTask; domain: number; shown: boolean; index: number; showPace: boolean;
}) {
  const u = usageOf(task);
  const v = Math.max(0, paceOf(task));
  const eta = erasToLine(task);
  // Badge follows the API's classification — don't re-derive the band here.
  const atLine = task.classification === "below_threshold";
  const uPct = (u / domain) * 100;
  const projPct = (Math.min(u + v, domain) / domain) * 100;
  const fit = task.r_squared != null
    ? `${confidenceWord(task.r_squared)} confidence · R² ${task.r_squared.toFixed(2)} across ${task.snapshot_count ?? "?"} eras`
    : undefined;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, color: theme.ink, lineHeight: 1.3, minWidth: 0 }}>
          {task.task_text}
          {atLine && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: ZONE_COLORS.alert, marginLeft: 8, whiteSpace: "nowrap" }}>
              {MOVEMENT_LABELS.below_threshold.toUpperCase()}
            </span>
          )}
        </span>
        <span title={fit} style={{ fontFamily: TYPE.mono, fontSize: 11.5, color: theme.inkMuted, flexShrink: 0, textAlign: "right" }}>
          <span style={{ color: theme.ink, fontWeight: 700 }}>{fmtUsage(u)}</span>
          {showPace && <span style={{ color: theme.current }}> {fmtPace(v)}</span>}
          {showPace && eta != null && eta > 0 && eta < 12 && (
            <span style={{ display: "block", fontSize: 9.5 }}>≈{Math.max(1, Math.round(eta))} era{Math.round(eta) === 1 ? "" : "s"} to the line</span>
          )}
        </span>
      </div>
      {/* Track: usage fill (the water already in) + pace segment (one more era
          at this pace, in the moving hue) toward the brass flip line. */}
      <div style={{ position: "relative", height: 11, borderRadius: 6, background: theme.ground, border: `1px solid ${theme.line}`, overflow: "hidden" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: shown ? `${uPct}%` : "0%",
          background: `${theme.current}55`, borderRadius: 6,
          transition: `width ${DUR.rise}ms ${EASE} ${index * 70}ms`,
        }} />
        {showPace && (
          <div style={{
            position: "absolute", top: 0, bottom: 0,
            left: shown ? `${uPct}%` : "0%",
            width: shown ? `${Math.max(projPct - uPct, 0.5)}%` : "0%",
            background: theme.current, opacity: 0.9,
            transition: `left ${DUR.rise}ms ${EASE} ${index * 70}ms, width ${DUR.rise}ms ${EASE} ${index * 70}ms`,
          }} />
        )}
      </div>
    </div>
  );
}

/** Rows + the one brass flip line, on a shared domain. Reused flat and per
 * family group (so every flip line sits at the same x). */
function RowsBlock({ rows, domain, shown, showPace, startIndex = 0 }: {
  rows: DriftTask[]; domain: number; shown: boolean; showPace: boolean; startIndex?: number;
}) {
  const linePct = (FLIP_THRESHOLD / domain) * 100;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((task, i) => (
          <ApproachRow key={task.task_text} task={task} domain={domain} shown={shown} index={startIndex + i} showPace={showPace} />
        ))}
      </div>
      <div
        title={`Tasks flip zones at ${fmtUsage(FLIP_THRESHOLD)} usage`}
        style={{ position: "absolute", top: -4, bottom: -4, left: `${linePct}%`, width: 0, borderLeft: `2px solid ${theme.brass}`, opacity: 0.85, pointerEvents: "none" }}
      />
    </div>
  );
}

/** Group the view's tasks by job family (a task appears under each family it
 * touches), sorted by rising-task load. Representative until the backend join. */
function groupByFamily(tasks: DriftTask[]): [string, DriftTask[]][] {
  const map = new Map<string, DriftTask[]>();
  for (const task of tasks) {
    for (const fam of task.families?.length ? task.families : ["Unassigned"]) {
      if (!map.has(fam)) map.set(fam, []);
      map.get(fam)!.push(task);
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

function TideList({ tasks, title, blurb, showPace, alertTint, filterKey }: {
  tasks: DriftTask[]; title: string; blurb: string; showPace: boolean; alertTint?: boolean; filterKey: string;
}) {
  const { ref, shown } = useReveal(0.15);
  const [grouped, setGrouped] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const domain = Math.max(0.6, ...tasks.map((t) => usageOf(t) + Math.max(0, paceOf(t)) * 1.2));
  const families = groupByFamily(tasks);
  const toggleFam = (f: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });

  const modeBtn = (on: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        padding: "4px 10px", fontSize: 11, border: "none", cursor: "pointer",
        fontFamily: "inherit", fontWeight: on ? 600 : 400,
        background: on ? theme.brass : theme.surface, color: on ? "#fff" : theme.inkMuted,
      }}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} style={{
      background: theme.surface, borderRadius: 12, padding: 20,
      border: `1.5px solid ${alertTint ? `${ZONE_COLORS.alert}50` : theme.line}`,
      transition: `border-color ${DUR.hover}ms ${EASE}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: TYPE.display, fontSize: 18, fontWeight: 600, color: alertTint ? ZONE_COLORS.alert : theme.ink }}>{title}</div>
          <div style={{ fontSize: 12.5, color: theme.inkMuted, marginTop: 2, maxWidth: 460, lineHeight: 1.4 }}>{blurb}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${theme.line}`, overflow: "hidden" }}>
            {modeBtn(!grouped, "By pace", () => setGrouped(false))}
            {modeBtn(grouped, "By job family", () => setGrouped(true))}
          </div>
          <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: theme.brass, whiteSpace: "nowrap" }}>
            ─ the line · {fmtUsage(FLIP_THRESHOLD)} usage
          </span>
        </div>
      </div>

      {/* Keyed by filter+mode so switching either plays the gentle fade-rise. */}
      <div key={`${filterKey}-${grouped ? "g" : "f"}`} style={{ marginTop: 16, animation: `sc-fade-rise ${DUR.bearing}ms ${EASE}` }}>
        {tasks.length === 0 && (
          <div style={{ fontSize: 12.5, color: theme.inkMuted, fontStyle: "italic" }}>No tasks in this view yet.</div>
        )}

        {tasks.length > 0 && !grouped && (
          <RowsBlock rows={tasks} domain={domain} shown={shown} showPace={showPace} />
        )}

        {tasks.length > 0 && grouped && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {families.map(([fam, famTasks], fi) => {
              const open = !collapsed.has(fam);
              const avgPace = famTasks.reduce((s, t) => s + Math.max(0, paceOf(t)), 0) / famTasks.length;
              return (
                <div key={fam} style={{ borderTop: fi > 0 ? `1px solid ${theme.line}` : "none", paddingTop: fi > 0 ? 12 : 0 }}>
                  <button
                    onClick={() => toggleFam(fam)}
                    aria-expanded={open}
                    style={{
                      width: "100%", display: "flex", alignItems: "baseline", gap: 8, padding: "4px 0",
                      background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontSize: 10, color: theme.inkMuted, width: 10, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
                    <span style={{ fontFamily: TYPE.display, fontSize: 14.5, fontWeight: 600, color: theme.ink }}>{fam}</span>
                    <span style={{ fontFamily: TYPE.mono, fontSize: 11, color: theme.inkMuted }}>· {famTasks.length} task{famTasks.length === 1 ? "" : "s"}</span>
                    {showPace && avgPace > 0 && (
                      <span style={{ fontFamily: TYPE.mono, fontSize: 11, color: theme.current, marginLeft: "auto" }}>avg {fmtPace(avgPace)}</span>
                    )}
                  </button>
                  {open && (
                    <div style={{ marginTop: 10, marginBottom: 6 }}>
                      <RowsBlock rows={famTasks} domain={domain} shown={shown} showPace={showPace} startIndex={fi * 3} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: TYPE.mono, fontSize: 9.5, color: theme.inkMuted, marginTop: 10 }}>
        <span>0%</span>
        <span>usage share of AI conversations →</span>
        <span>{fmtUsage(domain)}</span>
      </div>
    </div>
  );
}

// ── Page ──

/** The view the task list is focused on: everything moving (default), or one
 * movement class picked by clicking its stat tile. */
type TideFilter = "movers" | "departing" | "below_threshold" | "enduring";

export function TidePage() {
  const { data: summary, loading } = useApi(() => api.driftSummary(), []);
  const { data: departing } = useApi(() => api.driftDeparting(1, 15), []);
  const { data: belowThreshold } = useApi(() => api.driftBelowThreshold(), []);
  const { data: enduring } = useApi(() => api.driftEnduring(1, 10), []);
  const [filter, setFilter] = useState<TideFilter>("movers");

  useEffect(() => {
    ensureMotionStyles(); // the list swap uses the shared sc-fade-rise keyframe
  }, []);

  // Clicking a tile focuses its class; clicking it again returns to all movers.
  const toggle = (f: TideFilter) => setFilter((cur) => (cur === f ? "movers" : f));

  if (loading) {
    return (
      <div style={{ fontFamily: TYPE.body, color: theme.inkMuted, background: theme.surface, border: `1.5px solid ${theme.line}`, borderRadius: 12, padding: 24 }}>
        Reading the tide…
      </div>
    );
  }
  if (!summary) return null;

  // Derived, not hardcoded: era count from the data actually returned.
  const allTasks = [
    ...(departing?.tasks ?? []),
    ...(belowThreshold?.tasks ?? []),
    ...(enduring?.tasks ?? []),
  ];
  const maxEras = allTasks.reduce((m, t) => Math.max(m, t.snapshot_count ?? 0), 0);
  const avgPaceRising = summary.avg_velocity_departing;

  // All movers: at-the-waterline + rising tasks, deduped, sorted soonest-to-flip.
  const seen = new Set<string>();
  const movers = [...(belowThreshold?.tasks ?? []), ...(departing?.tasks ?? [])]
    .filter((t) => {
      if (seen.has(t.task_text) || paceOf(t) <= 0) return false;
      seen.add(t.task_text);
      return true;
    })
    .sort((a, b) => (erasToLine(a) ?? Infinity) - (erasToLine(b) ?? Infinity))
    .slice(0, 12);

  // One list, four lenses — the stat tiles are the navigation.
  const VIEWS: Record<TideFilter, { tasks: DriftTask[]; title: string; blurb: string; showPace: boolean; alertTint?: boolean }> = {
    movers: {
      tasks: movers,
      title: "Approaching the line",
      blurb: "Usage today plus one more era at the current pace — sorted by who reaches the brass line first.",
      showPace: true,
    },
    departing: {
      tasks: [...(departing?.tasks ?? [])].sort((a, b) => paceOf(b) - paceOf(a)).slice(0, 12),
      title: MOVEMENT_LABELS.departing,
      blurb: "Sorted by pace — the fastest climbers first.",
      showPace: true,
    },
    below_threshold: {
      tasks: [...(belowThreshold?.tasks ?? [])].sort((a, b) => (erasToLine(a) ?? Infinity) - (erasToLine(b) ?? Infinity)),
      title: MOVEMENT_LABELS.below_threshold,
      blurb: "Just below the line with usage still rising — the first to flip. A forecast, not an alarm.",
      showPace: true,
      alertTint: true,
    },
    enduring: {
      tasks: [...(enduring?.tasks ?? [])].sort((a, b) => usageOf(b) - usageOf(a)).slice(0, 12),
      title: MOVEMENT_LABELS.enduring,
      blurb: "The still water — AI usage of these tasks isn't moving era over era.",
      showPace: false,
    },
  };
  const view = VIEWS[filter];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: TYPE.body, color: theme.ink }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: TYPE.display, fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: -0.5 }}>Rising Tide</h1>
        <p style={{ fontSize: 14, color: theme.inkMuted, margin: "4px 0 0" }}>
          How fast AI usage is rising across {summary.total_tasks.toLocaleString()} tasks, model era over model era
          {maxEras >= 2 ? ` — trends read across up to ${maxEras} eras` : ""}.
        </p>
      </div>

      <ZoneLegend />

      {/* Stat row — the tiles ARE the navigation: click one to focus the list */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatTile label={MOVEMENT_LABELS.departing} value={summary.departing.toLocaleString()}
          subtitle="AI usage rising era over era" color={MOVEMENT_COLORS.departing}
          active={filter === "departing"} onClick={() => toggle("departing")} />
        <StatTile label={MOVEMENT_LABELS.enduring} value={summary.enduring.toLocaleString()}
          subtitle="usage stable or declining" color={MOVEMENT_COLORS.enduring}
          active={filter === "enduring"} onClick={() => toggle("enduring")} />
        <StatTile label={MOVEMENT_LABELS.below_threshold} value={summary.below_threshold.toLocaleString()}
          subtitle="the next tasks to flip zones" color={MOVEMENT_COLORS.below_threshold} alert
          active={filter === "below_threshold"} onClick={() => toggle("below_threshold")} />
        {avgPaceRising != null && (
          <StatTile label="Average pace, rising" value={fmtPace(avgPaceRising)}
            subtitle="typical climb per model era" color={theme.brass} />
        )}
      </div>
      {/* Sparsity, first-class — not a hidden remainder */}
      {summary.unclassified > 0 && (
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: -12 }}>
          <span style={{ fontWeight: 600, color: MOVEMENT_COLORS.unclassified }}>{MOVEMENT_LABELS.unclassified}:</span>{" "}
          {summary.unclassified.toLocaleString()} of {summary.total_tasks.toLocaleString()} tasks —
          not enough model eras yet to read a trend. Each new era converts more of these.
        </div>
      )}

      {/* ONE list, four lenses — filtered by the tiles above */}
      <Reveal>
        <Waypoint>WHAT THE TIDE REACHES NEXT</Waypoint>
        <TideList
          filterKey={filter}
          tasks={view.tasks}
          title={view.title}
          blurb={view.blurb}
          showPace={view.showPace}
          alertTint={view.alertTint}
        />
      </Reveal>

      {/* Honesty footer */}
      <div style={{ fontSize: 11, color: theme.inkMuted, fontStyle: "italic", textAlign: "center" }}>
        Movement here is AI <em>usage</em> share (attention), not proof of automation.
        {maxEras >= 2 ? ` Trends read across up to ${maxEras} model eras;` : " "}
        confidence varies per task — hover any figure for the underlying fit.
      </div>
    </div>
  );
}
