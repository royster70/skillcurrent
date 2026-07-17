/**
 * EraTide — the temporal companion to the spatial waterline: the capability
 * frontier rising across model *eras* (generations), with the current flowing
 * through it and work lines marking when each kind of work first went under.
 *
 * Data (was hardcoded; now real): the rising line is the FRONTIER — the running
 * best score on the best-covered Epoch AI ECI benchmark (GPQA diamond) across
 * model releases, from `GET /gdpval/waterline`. Plotting every release would
 * zigzag (a cheap model after a strong one dips the line); the frontier is
 * monotonic by construction and IS the thesis — "the tide only rises". Only
 * record-setting leaps are labelled, so ~7 real milestones read cleanly, with
 * real release dates → a real cadence (months, not decades).
 *
 * Honesty (brand §9): the line is AI *capability* (one comparable benchmark),
 * not "automation". The three work-difficulty levels are illustrative overlays
 * (no per-task series behind them) — but which real era first crossed each is
 * computed from the frontier. Falls back to a labelled representative series if
 * the endpoint is unavailable, so the graphic is never empty.
 */

import { useId, useMemo, useState, useEffect, useRef } from "react";
import { useApi } from "../hooks/useApi";
import { api, type WaterlineResponse } from "../lib/api";
import { THEME, TYPE } from "../lib/constants";
import { useLanguage } from "../lib/language";
import { DUR, EASE, prefersReducedMotion } from "./current/motion";

/** Reveal that self-heals: IntersectionObserver drives the rise on scroll, but a
 * timeout guarantees the water appears even if the observer never fires (the
 * chart must never sit empty the way a plain scroll-reveal safely can). */
function useSafeReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(prefersReducedMotion());
  useEffect(() => {
    if (shown) return;
    let done = false;
    const reveal = () => {
      if (!done) {
        done = true;
        setShown(true);
      }
    };
    const el = ref.current;
    if (el && typeof IntersectionObserver !== "undefined") {
      const obs = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) {
            reveal();
            obs.disconnect();
          }
        },
        { threshold: 0.2 },
      );
      obs.observe(el);
      const timer = setTimeout(reveal, 1600); // safety net
      return () => {
        obs.disconnect();
        clearTimeout(timer);
      };
    }
    reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, shown };
}

const t = THEME.light;

interface EraPoint {
  label: string;
  sub: string;
  level: number;
  today?: boolean;
  projected?: boolean;
}

interface Series {
  eras: EraPoint[];
  gaps: string[]; // one per interval between consecutive eras (incl. the projection)
  work: { label: string; level: number }[];
  real: boolean;
  benchmark?: string;
}

// A few kinds of work, by how hard they are for AI — the tide reaches each in
// turn. Illustrative levels (no per-task series behind them); the crossing era
// is computed from whichever series is live.
const WORK = [
  { label: "Data entry & lookup", level: 0.38 },
  { label: "Analysis & drafting", level: 0.58 },
  { label: "Judgment, care & direction", level: 0.92 },
];

// Representative fallback — used only if /gdpval/waterline is unavailable.
const REP_SERIES: Series = {
  eras: [
    { label: "GPT-3.5", sub: "'22", level: 0.26 },
    { label: "GPT-4", sub: "'23", level: 0.41 },
    { label: "Claude 3.5", sub: "'24", level: 0.54 },
    { label: "Claude 4", sub: "'25", level: 0.66, today: true },
    { label: "next", sub: "→", level: 0.8, projected: true },
  ],
  gaps: ["~4 mo", "~9 mo", "~7 mo", "months?"],
  work: WORK,
  real: false,
};

/** claude-4.6-opus → "Claude 4.6"; gpt-4.1 → "GPT-4.1"; o3 / o1-mini → as-is. */
function shortEra(era: string): string {
  if (era.startsWith("claude-")) return `Claude ${era.slice(7).split("-")[0]}`;
  if (era.startsWith("gpt-")) return `GPT-${era.slice(4)}`;
  return era;
}

function monthsBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24 * 30.44)));
}

interface RealPt {
  era: string;
  level: number;
  date: string;
}

/** The frontier: running-max over release date, keeping only meaningful leaps
 * (≥ LEAP), collapsing same-generation labels, and ending at the true best. */
function frontierPoints(eras: WaterlineResponse["by_benchmark"][number]["eras"]): RealPt[] {
  const LEAP = 0.06;
  const dated = eras
    .filter((e) => e.measurement_date)
    .sort((x, y) => (x.measurement_date! < y.measurement_date! ? -1 : 1));
  const pts: RealPt[] = [];
  let frontier = -Infinity;
  for (const e of dated) {
    if (pts.length > 0 && e.avg_score < frontier + LEAP) {
      if (e.avg_score > frontier) frontier = e.avg_score; // raise the bar quietly
      continue;
    }
    frontier = e.avg_score;
    const last = pts[pts.length - 1];
    const next: RealPt = { era: e.model_era, level: e.avg_score, date: e.measurement_date! };
    if (last && shortEra(last.era) === shortEra(e.model_era)) {
      if (e.avg_score >= last.level) pts[pts.length - 1] = next; // keep the higher of a generation
    } else {
      pts.push(next);
    }
  }
  // Make sure the last labelled point is the true current best.
  const gmax = dated.reduce((m, e) => (e.avg_score > m.avg_score ? e : m), dated[0]);
  const last = pts[pts.length - 1];
  if (last && last.era !== gmax.model_era && gmax.avg_score >= last.level) {
    const g: RealPt = { era: gmax.model_era, level: gmax.avg_score, date: gmax.measurement_date! };
    if (shortEra(last.era) === shortEra(gmax.model_era)) pts[pts.length - 1] = g;
    else pts.push(g);
  }
  return pts;
}

function buildSeries(data: WaterlineResponse | null): Series {
  if (!data || data.by_benchmark.length === 0) return REP_SERIES;
  const best = data.by_benchmark.reduce((a, b) => (b.eras.length > a.eras.length ? b : a));
  const pts = frontierPoints(best.eras);
  if (pts.length < 3) return REP_SERIES;

  const eras: EraPoint[] = pts.map((p, i) => ({
    label: shortEra(p.era),
    sub: `'${p.date.slice(2, 4)}`,
    level: p.level,
    today: i === pts.length - 1,
  }));
  // Projected next step — a modest extrapolation, clearly dashed.
  const deltas = pts.slice(1).map((p, i) => p.level - pts[i].level);
  const typical = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0.08;
  eras.push({
    label: "next",
    sub: "→",
    level: Math.min(0.98, pts[pts.length - 1].level + Math.max(0.04, typical)),
    projected: true,
  });

  const gaps = pts.slice(1).map((p, i) => `~${monthsBetween(pts[i].date, p.date)} mo`);
  gaps.push("next?");

  return { eras, gaps, work: WORK, real: true, benchmark: best.benchmark };
}

/** The last era whose frontier is at or above a work level (has reached it). */
function submergedEra(eras: EraPoint[], level: number): string | null {
  const hit = eras.filter((e) => !e.projected).find((e) => e.level >= level);
  return hit ? hit.label : null;
}

export function EraTide({ compact = false }: { compact?: boolean }) {
  const { mode } = useLanguage();
  const plain = mode === "plain";
  const { ref, shown } = useSafeReveal<HTMLDivElement>();
  const { data } = useApi(() => api.waterline(), []);
  const series = useMemo(() => buildSeries(data), [data]);
  const animate = !prefersReducedMotion();
  const clipId = useId();

  const eras = series.eras;
  const W = 720;
  const H = compact ? 120 : 250;
  const padL = 14;
  const padR = 14;
  const padT = compact ? 14 : 22;
  const padB = compact ? 26 : 52; // full leaves room for the cadence (months) row
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xOf = (i: number) => padL + (i * innerW) / (eras.length - 1);
  const yOf = (level: number) => padT + (1 - level) * innerH;

  const pts = eras.map((e, i) => ({ x: xOf(i), y: yOf(e.level), e }));
  const lastReal = pts[pts.length - 2]; // the "today" point (last before projection)
  const surfaceReal = "M" + pts.slice(0, -1).map((p) => `${p.x},${p.y}`).join(" L ");
  const surfaceProj = `M${lastReal.x},${lastReal.y} L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  const waterArea =
    `M${pts[0].x},${H - padB} L` +
    pts.slice(0, -1).map((p) => `${p.x},${p.y}`).join(" L ") +
    ` L${lastReal.x},${H - padB} Z`;

  return (
    <div ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", height: "auto", maxHeight: H + 20 }}
        role="img"
        aria-label="AI capability frontier rising across model eras"
      >
        <defs>
          <linearGradient id={`${clipId}-water`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.current} stopOpacity={0.32} />
            <stop offset="100%" stopColor={t.current} stopOpacity={0.08} />
          </linearGradient>
        </defs>

        {/* Era gridlines + baseline */}
        {pts.map((p, i) => (
          <line key={i} x1={p.x} y1={padT} x2={p.x} y2={H - padB} stroke={t.line} strokeWidth={1} opacity={0.6} />
        ))}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={t.line} strokeWidth={1} />

        {/* Work lines — where each kind of work sits; the tide reaches them in turn */}
        {!compact &&
          series.work.map((w, i) => {
            const y = yOf(w.level);
            const era = submergedEra(eras, w.level);
            const under = era != null;
            return (
              <g key={i}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke={under ? t.current : t.inkMuted}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={under ? 0.5 : 0.4}
                />
                <text x={padL + 2} y={y - 4} fontSize={10.5} fontFamily={TYPE.body} fill={t.ink}>
                  {w.label}
                </text>
                <text
                  x={W - padR - 2}
                  y={y - 4}
                  textAnchor="end"
                  fontSize={9}
                  fontFamily={TYPE.mono}
                  fill={under ? t.current : t.inkMuted}
                >
                  {under ? (plain ? `within reach since ${era}` : `under since ${era}`) : plain ? "still human-led" : "stays dry"}
                </text>
              </g>
            );
          })}

        {/* The water — ALWAYS visible (opacity never gated); it only slides up a
            touch on reveal, so a missed reveal leaves it ~14px low, never empty. */}
        <g
          style={{
            transform: shown || !animate ? "translateY(0)" : "translateY(14px)",
            transition: animate ? `transform ${DUR.rise}ms ${EASE}` : undefined,
          }}
        >
          <path d={waterArea} fill={`url(#${clipId}-water)`} />
          <path d={surfaceReal} fill="none" stroke={t.current} strokeWidth={2} strokeLinecap="round" />
          <path
            d={surfaceProj}
            fill="none"
            stroke={t.brass}
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            opacity={0.8}
          />
          {/* Current — dots drifting rightward along the surface */}
          {animate &&
            [0, 1, 2].map((k) => (
              <circle key={k} r={2.6} fill={t.current}>
                <animateMotion dur={`${5.5 + k}s`} begin={`${k * 1.4}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${clipId}-path`} />
                </animateMotion>
              </circle>
            ))}
          <path id={`${clipId}-path`} d={surfaceReal} fill="none" stroke="none" />
        </g>

        {/* Today marker */}
        <circle cx={lastReal.x} cy={lastReal.y} r={4} fill={t.brass} stroke={t.surface} strokeWidth={2} />

        {/* Era labels */}
        {pts.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={H - padB + 14}
            textAnchor="middle"
            fontSize={compact ? 9.5 : 10.5}
            fontFamily={TYPE.mono}
            fill={p.e.projected ? t.brass : p.e.today ? t.ink : t.inkMuted}
            fontWeight={p.e.today ? 700 : 400}
          >
            {p.e.label}
          </text>
        ))}
        {!compact &&
          pts.map((p, i) => (
            <text
              key={`s${i}`}
              x={p.x}
              y={H - padB + 25}
              textAnchor="middle"
              fontSize={8.5}
              fontFamily={TYPE.mono}
              fill={t.inkMuted}
            >
              {p.e.sub}
            </text>
          ))}

        {/* Cadence row — the gap between generations, in MONTHS (months, not
            decades). Brackets sit under each interval. */}
        {!compact &&
          pts.slice(0, -1).map((p, i) => {
            const next = pts[i + 1];
            const midX = (p.x + next.x) / 2;
            const y = H - padB + 40;
            const proj = i === pts.length - 2;
            const col = proj ? t.brass : t.inkMuted;
            return (
              <g key={`gap${i}`}>
                <path
                  d={`M${p.x + 8},${y - 8} v3 h${next.x - p.x - 16} v-3`}
                  fill="none"
                  stroke={col}
                  strokeWidth={1}
                  opacity={0.5}
                  strokeDasharray={proj ? "3 3" : undefined}
                />
                <text
                  x={midX}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily={TYPE.mono}
                  fontWeight={proj ? 700 : 400}
                  fill={col}
                >
                  {series.gaps[i]}
                </text>
              </g>
            );
          })}
      </svg>

      {!compact && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: TYPE.mono,
              fontSize: 9.5,
              color: t.inkMuted,
              marginTop: 2,
              padding: "0 4px",
            }}
          >
            <span>← earlier generations</span>
            <span>a generation every few months — not decades</span>
            <span style={{ color: t.brass }}>{plain ? "capability only rises →" : "the tide only rises →"}</span>
          </div>
          <div style={{ fontSize: 10, color: t.inkMuted, fontStyle: "italic", marginTop: 6, lineHeight: 1.5 }}>
            {series.real
              ? `Line: the capability frontier — best score on ${series.benchmark} across model releases (Epoch AI ECI). Work-difficulty levels are illustrative; the era each was first crossed is real.`
              : "Representative capability curve — the live per-release series (Epoch AI ECI) loads when available."}
          </div>
        </>
      )}
    </div>
  );
}
