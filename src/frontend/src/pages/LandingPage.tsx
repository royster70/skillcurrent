/** SkillCurrent landing — narrative scroll that flows into the live waterline
 * chart (design option 7a). One continuous "current" of streamlines guides the
 * reader from the hero, through a four-beat narrative arc (phenomenon → agency
 * → high ground → the instrument), into the chart — then bends toward whichever
 * exploration path the reader is considering. Reduced-motion aware throughout.
 */

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS, ZONE_LABELS } from "../lib/constants";
import { CurrentFlow, BackgroundCurrent, WaveUnderline } from "../components/current/CurrentFlow";
import { Waypoint } from "../components/Waypoint";
import { ZoneExplorer } from "../components/ZoneExplorer";
import { EraTide } from "../components/EraTide";
import { useReveal } from "../components/current/useReveal";
import { DUR, EASE, prefersReducedMotion } from "../components/current/motion";
import { IconSearch, IconSectors, IconTide } from "../components/current/icons";
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
  // Fills left→right, dry to submerged — the same axis every other view reads
  // on (E0 insulated → E2 automated). `order` staggers the reveal in that
  // direction so the bar builds the way the eye scans it.
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
        <div style={{ background: ZONE_COLORS.E0, ...seg(s.workers_e0, 0) }} title={`${ZONE_LABELS.E0} (insulated)`} />
        <div style={{ background: ZONE_COLORS.E1, ...seg(s.workers_e1, 1) }} title={`${ZONE_LABELS.E1} (augmented)`} />
        <div style={{ background: ZONE_COLORS.E2, ...seg(s.workers_e2, 2) }} title={`${ZONE_LABELS.E2} (automated)`} />
      </div>
      <div style={{ width: 52, fontFamily: TYPE.mono, fontSize: 13, color: t.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        β{(s.avg_eloundou_beta ?? 0).toFixed(2)}
      </div>
    </div>
  );
}

// The three currents = the three questions a first-time visitor actually
// arrives with (my role · my industry · where it's heading). This makes
// "Three currents to follow" literal, and answers the reader's own question
// before pointing at the documentation (which moves to a quiet link row below).
const PATHS: { to: string; Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>; title: string; blurb: string }[] = [
  {
    to: "/search",
    Icon: IconSearch,
    title: "Find your role",
    blurb: "Search 66,500+ job titles and see where yours sits on the scale.",
  },
  {
    to: "/sectors",
    Icon: IconSectors,
    title: "Scan your sector",
    blurb: "See which industries sit deepest — and which are still on dry ground.",
  },
  {
    to: "/tide",
    Icon: IconTide,
    title: "Watch the tide",
    blurb: "Which tasks are rising fastest, era over era — the reading this site is named for.",
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

  // Hash deep-links (e.g. the data pages' "Learn to read the scale →") land
  // scrolled to their section. Deferred past first paint via double-rAF so a
  // freshly-mounted (and async-growing) page has laid out before we measure
  // the target. Instant under prefers-reduced-motion.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [hash]);

  return (
    <div style={{ margin: -32, color: t.ink, fontFamily: TYPE.body }}>
      {/* ── Hero + narrative beats: ONE continuous current runs behind both —
          flowing left→right (forward, "where it's heading"), not downward, so
          the mood reads as direction-of-travel, never decline. ── */}
      <div style={{ position: "relative" }}>
        <BackgroundCurrent direction="right" strokes={7} opacity={0.22} speed={6} />

        <div style={{ position: "relative", zIndex: 1 }}>
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
              background: `linear-gradient(180deg, ${t.surface} 0%, transparent 100%)`,
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
            <button
              onClick={() =>
                document.getElementById("the-current")?.scrollIntoView({
                  behavior: prefersReducedMotion() ? "auto" : "smooth",
                  block: "start",
                })
              }
              style={{
                marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
              }}
            >
              <span style={{ position: "relative", display: "inline-block", paddingBottom: 4 }}>
                <span style={{ color: t.brass, fontSize: 17, fontWeight: 700, fontFamily: TYPE.mono, letterSpacing: 3.5 }}>
                  FOLLOW THE CURRENT
                </span>
                <WaveUnderline color={t.brass} />
              </span>
              <span aria-hidden="true" style={{ color: t.inkMuted, fontSize: 15, opacity: 0.6 }}>⌄</span>
            </button>
          </section>

          {/* ── Narrative beats — float on the current, don't interrupt it ── */}
          <section id="the-current" style={{ maxWidth: 720, margin: "0 auto", padding: "20px 32px 60px", scrollMarginTop: 24 }}>
            {BEATS.map((beat, i) => (
              <Reveal key={i} delay={i * 60}>
                <div style={{ padding: "56px 0", textAlign: "center" }}>
                  {beat.waypoint && <Waypoint center>{beat.waypoint}</Waypoint>}
                  <p
                    style={{
                      fontFamily: TYPE.display,
                      fontSize: "clamp(22px, 3.6vw, 30px)",
                      lineHeight: 1.35,
                      color: t.ink,
                      margin: 0,
                      background: t.ground,
                      display: "inline",
                      boxDecorationBreak: "clone",
                      WebkitBoxDecorationBreak: "clone",
                      padding: "0.15em 0.4em",
                      borderRadius: 6,
                    }}
                  >
                    {beat.line}
                  </p>
                </div>
              </Reveal>
            ))}
          </section>
        </div>
      </div>

      {/* ── READ THE SCALE: the interactive Beta instrument (design 7b) —
          beat 4's "Read it" hands off into actually learning the scale,
          before the measured chart. The one teaching home for Beta; data
          pages' ZoneLegend links here. ── */}
      {/* NOT wrapped in Reveal: this is a deep-link destination (the data
          pages' ZoneLegend links to #read-the-scale) — a scroll-reveal
          opacity gate would leave it invisible when a jump lands without a
          scroll event. Always visible on arrival. */}
      <section id="read-the-scale" style={{ maxWidth: 900, margin: "0 auto", padding: "12px 32px 48px", scrollMarginTop: 24 }}>
        <Waypoint>READ THE SCALE</Waypoint>
        <h2 style={{ fontFamily: TYPE.display, fontSize: 30, fontWeight: 600, margin: "0 0 6px" }}>
          The instrument: Beta
        </h2>
        <p style={{ color: t.inkMuted, fontSize: 15, maxWidth: 640, marginTop: 0, marginBottom: 18 }}>
          Every task gets one exposure reading — Beta, from the Eloundou 2024
          research. Where it falls on the scale decides the zone: still dry,
          at the line, or submerged. Drag the handle and try it.
        </p>
        <ZoneExplorer />
      </section>

      {/* ── THE TIDE OVER TIME: the temporal dimension — what an "era" is and
          why the waterline keeps climbing. The spatial views (tank, sectors)
          show one frame; this shows the motion between frames. ── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "12px 32px 48px" }}>
        <Reveal>
          <Waypoint>THE TIDE OVER TIME</Waypoint>
          <h2 style={{ fontFamily: TYPE.display, fontSize: 30, fontWeight: 600, margin: "0 0 6px" }}>
            Why the waterline keeps rising
          </h2>
          <p style={{ color: t.inkMuted, fontSize: 15, maxWidth: 640, marginTop: 0, marginBottom: 18 }}>
            An <strong style={{ color: t.brass }}>era</strong> is a model generation — and they now
            arrive in <strong>months, not decades</strong>. GPT-3.5, GPT-4, Claude 3.5, Claude 4: each
            one lifts the waterline, and work that sat safely above it slips under. That's the current
            these pages measure — rising an order of magnitude faster than past technological shifts,
            and never backward.
          </p>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: "18px 20px 14px" }}>
            <EraTide />
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/tide" style={{ color: t.brass, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              See which tasks are rising now, era over era →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ── The live waterline chart ── */}
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
            {/* Legend — dry → submerged, matching the bars' left→right order */}
            <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 12.5, color: t.inkMuted }}>
              {(["E0", "E1", "E2"] as const).map((z) => (
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
          <div style={{ textAlign: "center", fontSize: 14.5, color: t.inkMuted, marginBottom: 8, maxWidth: 540, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
            Three ways to read the water — start wherever your question is.
          </div>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <CurrentFlow direction="right" length={200} breadth={54} strokes={3} opacity={0.3} bearing={pathsBearing} />
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

          {/* Secondary — the "understand" audience (how it's built, what's in
              the data). Kept quiet so it doesn't compete with the three currents. */}
          <div style={{ textAlign: "center", marginTop: 22, fontSize: 13.5, color: t.inkMuted }}>
            New here?{" "}
            <Link to="/methodology" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>How it works</Link>
            {" · "}
            <Link to="/sources" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>the data behind it</Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
