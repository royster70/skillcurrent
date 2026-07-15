/**
 * EraTide — the temporal companion to the spatial waterline: the tide rising
 * across model *eras* (generations). Teaches what an "era" is and shows the
 * capability waterline climbing era over era, with the current flowing through
 * it. Task lines mark when each kind of work first went under.
 *
 * Motion (brand §9): the water RISES on reveal (wayfinding, the core thesis)
 * and the current drifts rightward along the surface. Honest framing — the
 * rising line is AI *capability* (the exposure frontier), representative here;
 * the live per-era usage trajectory is the Rising Tide page. Never "automation".
 *
 * Representative until the backend serves a per-era series (Epoch ECI /
 * gptval waterline). `compact` = a slim reminder strip (no task lines).
 */

import { useId, useState, useEffect, useRef } from "react";
import { THEME, TYPE } from "../lib/constants";
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
    const reveal = () => { if (!done) { done = true; setShown(true); } };
    const el = ref.current;
    if (el && typeof IntersectionObserver !== "undefined") {
      const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { reveal(); obs.disconnect(); } }, { threshold: 0.2 });
      obs.observe(el);
      const timer = setTimeout(reveal, 1600); // safety net
      return () => { obs.disconnect(); clearTimeout(timer); };
    }
    reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, shown };
}

const t = THEME.light;

// Representative capability waterline per model era (0–1 = the exposure frontier).
// Rises each generation; the last is a dashed projection ("where it's heading").
const ERAS = [
  { label: "GPT-3.5", sub: "'22", level: 0.26 },
  { label: "GPT-4", sub: "'23", level: 0.41 },
  { label: "Claude 3.5", sub: "'24", level: 0.54 },
  { label: "Claude 4", sub: "'25", level: 0.66, today: true },
  { label: "next", sub: "→", level: 0.8, projected: true },
];

// A few kinds of work, by how hard they are for AI — the tide reaches each in turn.
const WORK = [
  { label: "Data entry & lookup", level: 0.38 },
  { label: "Analysis & drafting", level: 0.58 },
  { label: "Judgment, care & direction", level: 0.92 },
];

/** The last era whose waterline is at or below (i.e. has reached) a work level. */
function submergedEra(level: number): string | null {
  const real = ERAS.filter((e) => !e.projected);
  const hit = real.find((e) => e.level >= level);
  return hit ? hit.label : null;
}

export function EraTide({ compact = false }: { compact?: boolean }) {
  const { ref, shown } = useSafeReveal<HTMLDivElement>();
  const animate = !prefersReducedMotion();
  const clipId = useId();

  const W = 720;
  const H = compact ? 120 : 250;
  const padL = 14;
  const padR = 14;
  const padT = compact ? 14 : 22;
  const padB = compact ? 26 : 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xOf = (i: number) => padL + (i * innerW) / (ERAS.length - 1);
  const yOf = (level: number) => padT + (1 - level) * innerH;

  const pts = ERAS.map((e, i) => ({ x: xOf(i), y: yOf(e.level), e }));
  const lastReal = pts[pts.length - 2]; // Claude 4
  const surfaceReal = "M" + pts.slice(0, -1).map((p) => `${p.x},${p.y}`).join(" L ");
  const surfaceProj = `M${lastReal.x},${lastReal.y} L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  const waterArea =
    `M${pts[0].x},${H - padB} L` +
    pts.slice(0, -1).map((p) => `${p.x},${p.y}`).join(" L ") +
    ` L${lastReal.x},${H - padB} Z`;

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "auto", maxHeight: H + 20 }} role="img" aria-label="AI capability waterline rising across model eras">
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
        {!compact && WORK.map((w, i) => {
          const y = yOf(w.level);
          const era = submergedEra(w.level);
          const under = era != null;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={under ? t.current : t.inkMuted} strokeWidth={1} strokeDasharray="4 4" opacity={under ? 0.5 : 0.4} />
              <text x={padL + 2} y={y - 4} fontSize={10.5} fontFamily={TYPE.body} fill={t.ink}>{w.label}</text>
              <text x={W - padR - 2} y={y - 4} textAnchor="end" fontSize={9} fontFamily={TYPE.mono} fill={under ? t.current : t.inkMuted}>
                {under ? `under since ${era}` : "stays dry"}
              </text>
            </g>
          );
        })}

        {/* The water — ALWAYS visible (opacity never gated); it only slides up a
            touch on reveal, so a missed reveal leaves it ~14px low, never empty.
            The continuous motion is the drifting current below, not the entrance. */}
        <g
          style={{
            transform: shown || !animate ? "translateY(0)" : "translateY(14px)",
            transition: animate ? `transform ${DUR.rise}ms ${EASE}` : undefined,
          }}
        >
          <path d={waterArea} fill={`url(#${clipId}-water)`} />
          <path d={surfaceReal} fill="none" stroke={t.current} strokeWidth={2} strokeLinecap="round" />
          <path d={surfaceProj} fill="none" stroke={t.brass} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" opacity={0.8} />
          {/* Current — dots drifting rightward along the surface */}
          {animate && [0, 1, 2].map((k) => (
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
          <text key={i} x={p.x} y={H - padB + 14} textAnchor="middle" fontSize={compact ? 9.5 : 10.5} fontFamily={TYPE.mono} fill={p.e.projected ? t.brass : p.e.today ? t.ink : t.inkMuted} fontWeight={p.e.today ? 700 : 400}>
            {p.e.label}
          </text>
        ))}
        {!compact && pts.map((p, i) => (
          <text key={`s${i}`} x={p.x} y={H - padB + 25} textAnchor="middle" fontSize={8.5} fontFamily={TYPE.mono} fill={t.inkMuted}>{p.e.sub}</text>
        ))}
      </svg>

      {!compact && (
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: TYPE.mono, fontSize: 9.5, color: t.inkMuted, marginTop: 2, padding: "0 4px" }}>
          <span>← earlier generations</span>
          <span style={{ color: t.brass }}>the tide only rises →</span>
        </div>
      )}
    </div>
  );
}
