/** SkillCurrent landing — narrative scroll that flows into the live waterline
 * chart (design option 7a). One continuous "current" of streamlines guides the
 * reader from the hero, through a four-beat narrative arc (phenomenon → agency
 * → high ground → the instrument), into the chart — then bends toward whichever
 * exploration path the reader is considering. Reduced-motion aware throughout.
 */

import { useState, type ReactNode, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS, ZONE_LABELS } from "../lib/constants";
import { CurrentFlow } from "../components/current/CurrentFlow";
import { useReveal } from "../components/current/useReveal";
import { DUR, EASE } from "../components/current/motion";
import { IconOccupations, IconAnchor, IconSources } from "../components/current/icons";
import type { ComponentType, SVGProps } from "react";

const t = THEME.light;

// ── Scroll-reveal wrapper (fade + rise when scrolled into view) ──
function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  const { ref, shown } = useReveal();
  return (
    <div
      ref={ref}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(28px)",
        transition: `opacity ${DUR.reveal}ms ${EASE} ${delay}ms, transform ${DUR.reveal}ms ${EASE} ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── Waypoint eyebrow (mono, brass — the page's nautical wayfinding labels) ──
function Waypoint({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <div
      style={{
        fontFamily: TYPE.mono,
        fontSize: 12,
        letterSpacing: 2,
        color: t.brass,
        textAlign: center ? "center" : "left",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

// ── A thin connector of current between narrative beats ──
function Thread() {
  return (
    <div style={{ textAlign: "center" }}>
      <CurrentFlow direction="down" length={90} breadth={120} strokes={3} opacity={0.3} />
    </div>
  );
}

interface Sector {
  naics_code: string;
  naics_title: string;
  avg_eloundou_beta: number | null;
  workers_e0: number;
  workers_e1: number;
  workers_e2: number;
}

// ── Waterline bar: the water rises into place on reveal ──
function WaterlineBar({ s, shown, index }: { s: Sector; shown: boolean; index: number }) {
  const total = Math.max(1, s.workers_e0 + s.workers_e1 + s.workers_e2);
  const pct = (n: number) => (n / total) * 100;
  // Submerged fills first, then the line, then the dry ground.
  const seg = (n: number, order: number): CSSProperties => ({
    width: shown ? `${pct(n)}%` : "0%",
    transition: `width ${DUR.rise}ms ${EASE} ${index * 60 + order * 120}ms`,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <div
        style={{
          width: "34%",
          maxWidth: 210,
          fontSize: 13,
          color: t.ink,
          textAlign: "right",
          flexShrink: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={s.naics_title}
      >
        {s.naics_title}
      </div>
      <div style={{ flex: 1, minWidth: 60, display: "flex", height: 26, borderRadius: 4, overflow: "hidden", border: `1px solid ${t.line}` }}>
        <div style={{ background: ZONE_COLORS.E2, ...seg(s.workers_e2, 0) }} title={`${ZONE_LABELS.E2} (automated)`} />
        <div style={{ background: ZONE_COLORS.E1, ...seg(s.workers_e1, 1) }} title={`${ZONE_LABELS.E1} (augmented)`} />
        <div style={{ background: ZONE_COLORS.E0, ...seg(s.workers_e0, 2) }} title={`${ZONE_LABELS.E0} (insulated)`} />
      </div>
      <div style={{ width: 52, fontFamily: TYPE.mono, fontSize: 13, color: t.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        β{(s.avg_eloundou_beta ?? 0).toFixed(2)}
      </div>
    </div>
  );
}

const PATHS: { to: string; Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>; title: string; blurb: string }[] = [
  {
    to: "/occupations",
    Icon: IconOccupations,
    title: "Explore skills",
    blurb: "Find the high ground — the skills that stay above the line.",
  },
  {
    to: "/methodology",
    Icon: IconAnchor,
    title: "How this works",
    blurb: "From public data to a single, honest exposure signal.",
  },
  {
    to: "/sources",
    Icon: IconSources,
    title: "What's the data",
    blurb: "Every signal, its vintage and licence — open by design.",
  },
];

// ── The four narrative beats: phenomenon → agency → high ground → instrument ──
const BEATS: { waypoint?: string; line: ReactNode }[] = [
  {
    waypoint: "THE CURRENT",
    line: (
      <>AI capability is rising through the tasks that make up every job — not evenly, and not all at once.</>
    ),
  },
  {
    line: (
      <>A <strong style={{ color: t.brass }}>current</strong> is something you read and navigate. Read it well, and it carries you forward.</>
    ),
  },
  {
    waypoint: "THE HIGH GROUND",
    line: (
      <>Some tasks slip below the line. The skills that stay dry — judgment, care, direction — are the high ground. <strong>That's where you're headed.</strong></>
    ),
  },
  {
    line: (
      <>This is the waterline, measured — across sectors, occupations, and 19,000 tasks. Read it, then choose your course.</>
    ),
  },
];

export function LandingPage() {
  const { data } = useApi(() => api.sectors("US"), []);
  const sectors = [...(data?.sectors ?? [])].sort(
    (a, b) => (b.avg_eloundou_beta ?? 0) - (a.avg_eloundou_beta ?? 0),
  );
  const chart = useReveal();
  const [hoveredPath, setHoveredPath] = useState(-1);
  // Bearing convention (motion.ts): left option bends the current left, etc.
  const pathsBearing = hoveredPath === -1 ? 0 : (hoveredPath - 1) * 26;

  return (
    <div style={{ margin: -32, color: t.ink, fontFamily: TYPE.body }}>
      {/* ── Hero ── */}
      <section
        style={{
          minHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 32px",
          background: `linear-gradient(180deg, ${t.surface} 0%, ${t.ground} 100%)`,
        }}
      >
        <div style={{ fontFamily: TYPE.mono, fontSize: 12, letterSpacing: 2, color: t.inkMuted, marginBottom: 20 }}>
          OPEN INTELLIGENCE FOR THE CHANGING WORLD OF WORK
        </div>
        <h1 style={{ fontFamily: TYPE.display, fontSize: "clamp(30px, 7vw, 62px)", fontWeight: 600, margin: 0, letterSpacing: -1, lineHeight: 1.05 }}>
          Skill<span style={{ color: t.brass }}>Current</span>
        </h1>
        <p style={{ maxWidth: 560, fontSize: "clamp(16px, 2.4vw, 19px)", lineHeight: 1.5, color: t.inkMuted, marginTop: 20 }}>
          AI capability is rising like a waterline across the work we do. See where
          it sits today, where it's heading — and the skills that keep you above it.
        </p>
        <div style={{ marginTop: 8 }}>
          <CurrentFlow direction="down" length={140} breadth={220} strokes={3} opacity={0.35} />
        </div>
        <div style={{ color: t.brass, fontSize: 12.5, fontFamily: TYPE.mono, letterSpacing: 1.5 }}>
          FOLLOW THE CURRENT
        </div>
      </section>

      {/* ── Narrative beats, threaded by the current ── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px 0" }}>
        {BEATS.map((beat, i) => (
          <div key={i}>
            <Reveal delay={i * 60}>
              <div style={{ padding: "56px 0", textAlign: "center" }}>
                {beat.waypoint && <Waypoint center>{beat.waypoint}</Waypoint>}
                <p
                  style={{
                    fontFamily: TYPE.display,
                    fontSize: "clamp(22px, 3.6vw, 30px)",
                    lineHeight: 1.35,
                    color: t.ink,
                    margin: 0,
                  }}
                >
                  {beat.line}
                </p>
              </div>
            </Reveal>
            {i < BEATS.length - 1 && <Thread />}
          </div>
        ))}
      </section>

      {/* ── The live waterline chart (beat 4 lands here) ── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "24px 32px 60px" }}>
        <Reveal>
          <Waypoint>THE WATERLINE, TODAY</Waypoint>
          <h2 style={{ fontFamily: TYPE.display, fontSize: 30, fontWeight: 600, margin: "0 0 6px" }}>
            The waterline across sectors
          </h2>
          <p style={{ color: t.inkMuted, fontSize: 15, maxWidth: 640, marginTop: 0 }}>
            Each bar is a sector's workforce, split by how deep AI capability has
            risen through its tasks — submerged, at the line, or still dry. Sorted
            by exposure.
          </p>

          <div
            ref={chart.ref}
            style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: "22px 24px", marginTop: 18 }}
          >
            {sectors.map((s, i) => (
              <WaterlineBar key={s.naics_code} s={s} shown={chart.shown} index={i} />
            ))}
            {/* Legend */}
            <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 12.5, color: t.inkMuted }}>
              {(["E2", "E1", "E0"] as const).map((z) => (
                <span key={z} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 2, background: ZONE_COLORS[z] }} />
                  {ZONE_LABELS[z]}
                </span>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/sectors" style={{ color: t.brass, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>
              See the full sector table →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ── Exploration paths: the current bends toward your choice ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "20px 32px 90px" }}>
        <Reveal>
          <Waypoint center>CHOOSE YOUR COURSE</Waypoint>
          <div style={{ textAlign: "center", fontFamily: TYPE.display, fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
            Three currents to follow
          </div>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <CurrentFlow direction="down" length={72} breadth={140} strokes={3} opacity={0.3} bearing={pathsBearing} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
            {PATHS.map((p, i) => (
              <Link
                key={p.to}
                to={p.to}
                style={{
                  display: "block",
                  textDecoration: "none",
                  background: t.surface,
                  border: `1px solid ${hoveredPath === i ? t.brass : t.line}`,
                  borderRadius: 10,
                  padding: "22px 20px",
                  color: t.ink,
                  transform: hoveredPath === i ? "translateY(-2px)" : "translateY(0)",
                  transition: `border-color ${DUR.hover}ms ${EASE}, transform ${DUR.hover}ms ${EASE}`,
                }}
                onMouseEnter={() => setHoveredPath(i)}
                onMouseLeave={() => setHoveredPath(-1)}
                onFocus={() => setHoveredPath(i)}
                onBlur={() => setHoveredPath(-1)}
              >
                <div style={{ color: hoveredPath === i ? t.brass : t.inkMuted, marginBottom: 12, transition: `color ${DUR.hover}ms ${EASE}` }}>
                  <p.Icon size={26} />
                </div>
                <div style={{ fontFamily: TYPE.display, fontSize: 19, fontWeight: 600, marginBottom: 6 }}>{p.title}</div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: t.inkMuted }}>{p.blurb}</div>
                <div style={{ position: "relative", marginTop: 12, height: 20 }}>
                  {hoveredPath === i && (
                    <div style={{ position: "absolute", inset: 0 }}>
                      <CurrentFlow direction="right" length={130} breadth={18} strokes={2} opacity={0.45} speed={2.6} />
                    </div>
                  )}
                  <span style={{ position: "relative", color: t.brass, fontSize: 13, fontWeight: 600 }}>Follow →</span>
                </div>
              </Link>
            ))}
          </div>
        </Reveal>
      </section>
    </div>
  );
}
