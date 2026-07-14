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

import { type ReactNode } from "react";
import { useApi } from "../hooks/useApi";
import { api, type DriftTask } from "../lib/api";
import { MOVEMENT_COLORS, MOVEMENT_LABELS, ZONE_COLORS, ZONE_BG, THEME, TYPE } from "../lib/constants";
import { ZoneLegend } from "../components/ZoneExplorer";
import { useReveal } from "../components/current/useReveal";
import { DUR, EASE } from "../components/current/motion";

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

/** Stat tile — surface card, mono number (brief §8), quiet label. */
function StatTile({ label, value, subtitle, color, alert }: {
  label: string; value: string; subtitle: string; color: string; alert?: boolean;
}) {
  return (
    <div style={{
      flex: "1 1 160px", minWidth: 150, padding: "16px 18px", borderRadius: 12,
      display: "flex", flexDirection: "column", gap: 4,
      background: alert ? ZONE_BG.alert : theme.surface,
      border: `1.5px solid ${alert ? `${ZONE_COLORS.alert}40` : theme.line}`,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1, color: theme.inkMuted, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: TYPE.mono, fontSize: 30, fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: theme.inkMuted }}>{subtitle}</div>
    </div>
  );
}

// ── The hero: tasks approaching the flip line, sorted by soonest-to-flip ──

function ApproachRow({ task, domain, shown, index }: { task: DriftTask; domain: number; shown: boolean; index: number }) {
  const u = usageOf(task);
  const v = Math.max(0, paceOf(task));
  const eta = erasToLine(task);
  // Badge follows the API's classification — don't re-derive the band here.
  const atLine = task.classification === "below_threshold";
  const uPct = (u / domain) * 100;
  const projPct = (Math.min(u + v, domain) / domain) * 100;
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
        <span style={{ fontFamily: TYPE.mono, fontSize: 11.5, color: theme.inkMuted, flexShrink: 0, textAlign: "right" }}>
          <span style={{ color: theme.ink, fontWeight: 700 }}>{fmtUsage(u)}</span>
          <span style={{ color: theme.current }}> {fmtPace(v)}</span>
          {eta != null && eta > 0 && eta < 12 && (
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
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: shown ? `${uPct}%` : "0%",
          width: shown ? `${Math.max(projPct - uPct, 0.5)}%` : "0%",
          background: theme.current, opacity: 0.9,
          transition: `left ${DUR.rise}ms ${EASE} ${index * 70}ms, width ${DUR.rise}ms ${EASE} ${index * 70}ms`,
        }} />
      </div>
    </div>
  );
}

function ApproachingTheLine({ tasks }: { tasks: DriftTask[] }) {
  const { ref, shown } = useReveal(0.15);
  if (tasks.length === 0) return null;
  const domain = Math.max(0.6, ...tasks.map((t) => usageOf(t) + Math.max(0, paceOf(t)) * 1.2));
  const linePct = (FLIP_THRESHOLD / domain) * 100;
  return (
    <div ref={ref} style={{ background: theme.surface, borderRadius: 12, border: `1.5px solid ${theme.line}`, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: TYPE.display, fontSize: 18, fontWeight: 600 }}>Approaching the line</div>
          <div style={{ fontSize: 12.5, color: theme.inkMuted, marginTop: 2, maxWidth: 520, lineHeight: 1.4 }}>
            Each task's AI-usage share today, plus one more era at its current pace.
            The brass line is where a task flips zones — sorted by who gets there first.
          </div>
        </div>
        <span style={{ fontFamily: TYPE.mono, fontSize: 10.5, color: theme.brass, whiteSpace: "nowrap" }}>
          ─ the line · {fmtUsage(FLIP_THRESHOLD)} usage
        </span>
      </div>

      {/* Rows share one axis; the brass flip line runs through all of them */}
      <div style={{ position: "relative", marginTop: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tasks.map((task, i) => (
            <ApproachRow key={task.task_text} task={task} domain={domain} shown={shown} index={i} />
          ))}
        </div>
        <div
          title={`Tasks flip zones at ${fmtUsage(FLIP_THRESHOLD)} usage`}
          style={{ position: "absolute", top: -4, bottom: -4, left: `${linePct}%`, width: 0, borderLeft: `2px solid ${theme.brass}`, opacity: 0.85, pointerEvents: "none" }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: TYPE.mono, fontSize: 9.5, color: theme.inkMuted, marginTop: 8 }}>
        <span>0%</span>
        <span>usage share of AI conversations →</span>
        <span>{fmtUsage(domain)}</span>
      </div>
    </div>
  );
}

// ── Page ──

export function TidePage() {
  const { data: summary, loading } = useApi(() => api.driftSummary(), []);
  const { data: departing } = useApi(() => api.driftDeparting(1, 15), []);
  const { data: belowThreshold } = useApi(() => api.driftBelowThreshold(), []);
  const { data: enduring } = useApi(() => api.driftEnduring(1, 10), []);

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

  // Hero rows: at-the-waterline + rising tasks, deduped, sorted soonest-to-flip.
  const seen = new Set<string>();
  const heroTasks = [...(belowThreshold?.tasks ?? []), ...(departing?.tasks ?? [])]
    .filter((t) => {
      if (seen.has(t.task_text) || paceOf(t) <= 0) return false;
      seen.add(t.task_text);
      return true;
    })
    .sort((a, b) => {
      const ea = erasToLine(a) ?? Infinity;
      const eb = erasToLine(b) ?? Infinity;
      return ea - eb;
    })
    .slice(0, 12);

  const fastestRising = [...(departing?.tasks ?? [])]
    .sort((a, b) => paceOf(b) - paceOf(a))
    .slice(0, 8);

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

      {/* Stat row */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatTile label={MOVEMENT_LABELS.departing} value={summary.departing.toLocaleString()}
          subtitle="AI usage rising era over era" color={MOVEMENT_COLORS.departing} />
        <StatTile label={MOVEMENT_LABELS.enduring} value={summary.enduring.toLocaleString()}
          subtitle="usage stable or declining" color={MOVEMENT_COLORS.enduring} />
        <StatTile label={MOVEMENT_LABELS.below_threshold} value={summary.below_threshold.toLocaleString()}
          subtitle="the next tasks to flip zones" color={MOVEMENT_COLORS.below_threshold} alert />
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

      {/* Hero */}
      <Reveal>
        <Waypoint>WHAT THE TIDE REACHES NEXT</Waypoint>
        <ApproachingTheLine tasks={heroTasks} />
      </Reveal>

      {/* At the waterline strip */}
      {belowThreshold && belowThreshold.tasks.length > 0 && (
        <Reveal>
          <div style={{ background: ZONE_BG.alert, borderRadius: 12, border: `1.5px solid ${ZONE_COLORS.alert}40`, padding: 20 }}>
            <div style={{ fontFamily: TYPE.display, fontSize: 16, fontWeight: 600, color: ZONE_COLORS.alert, marginBottom: 6 }}>
              {MOVEMENT_LABELS.below_threshold}
            </div>
            <p style={{ fontSize: 13, color: theme.inkMuted, margin: "0 0 14px", lineHeight: 1.5 }}>
              These tasks sit just below the line with usage still rising — the first
              to flip zones as the tide comes in. A forecast, not an alarm: use the
              lead time.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {belowThreshold.tasks.map((t) => (
                <div key={t.task_text} style={{
                  background: theme.surface, borderRadius: 8, padding: "10px 14px",
                  border: `1px solid ${ZONE_COLORS.alert}30`,
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
                }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 180 }}>{t.task_text}</span>
                  <span style={{ fontFamily: TYPE.mono, fontSize: 12, color: theme.inkMuted, flexShrink: 0 }}>
                    <span style={{ color: theme.ink, fontWeight: 700 }}>{fmtUsage(usageOf(t))}</span>
                    {" · "}
                    <span style={{ color: theme.current }}>{fmtPace(paceOf(t))}</span>
                    {" · "}
                    <span title={t.r_squared != null ? `R² ${t.r_squared.toFixed(2)} across ${t.snapshot_count ?? "?"} eras` : undefined}>
                      {confidenceWord(t.r_squared)} confidence
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* Two-column close: the movers | the still water */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Reveal>
          <div style={{ flex: "1 1 340px", minWidth: 300 }}>
            <Waypoint>FASTEST RISING</Waypoint>
            <div style={{ background: theme.surface, borderRadius: 12, border: `1.5px solid ${theme.line}`, padding: 18, display: "flex", flexDirection: "column", gap: 9 }}>
              {fastestRising.map((t) => (
                <div key={t.task_text} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, borderBottom: `1px solid ${theme.line}`, paddingBottom: 8 }}>
                  <span style={{ fontSize: 12.5, lineHeight: 1.3, minWidth: 0 }}>{t.task_text}</span>
                  <span
                    title={t.r_squared != null ? `usage ${fmtUsage(usageOf(t))} · R² ${t.r_squared.toFixed(2)}` : undefined}
                    style={{ fontFamily: TYPE.mono, fontSize: 12, fontWeight: 700, color: theme.current, whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    {fmtPace(paceOf(t))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div style={{ flex: "1 1 340px", minWidth: 300 }}>
            <Waypoint>HOLDING FAST</Waypoint>
            <div style={{ background: theme.surface, borderRadius: 12, border: `1.5px solid ${theme.line}`, padding: 18, display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ fontSize: 12, color: theme.inkMuted, lineHeight: 1.5, marginBottom: 2 }}>
                The still water — tasks whose AI usage isn't moving. The calm counterpoint
                to the movers on the left.
              </div>
              {(enduring?.tasks ?? []).slice(0, 8).map((t) => (
                <div key={t.task_text} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, borderBottom: `1px solid ${theme.line}`, paddingBottom: 8 }}>
                  <span style={{ fontSize: 12.5, lineHeight: 1.3, minWidth: 0 }}>{t.task_text}</span>
                  <span style={{ fontFamily: TYPE.mono, fontSize: 12, fontWeight: 600, color: theme.ink, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {fmtUsage(usageOf(t))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      {/* Honesty footer */}
      <div style={{ fontSize: 11, color: theme.inkMuted, fontStyle: "italic", textAlign: "center" }}>
        Movement here is AI <em>usage</em> share (attention), not proof of automation.
        {maxEras >= 2 ? ` Trends read across up to ${maxEras} model eras;` : " "}
        confidence varies per task — hover any figure for the underlying fit.
      </div>
    </div>
  );
}
