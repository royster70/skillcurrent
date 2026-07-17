/** SkillCurrent landing — narrative scroll that flows into the live waterline
 * chart (design option 7a). One continuous "current" of streamlines guides the
 * reader from the hero, through a four-beat narrative arc (phenomenon → agency
 * → high ground → the instrument), into the chart — then bends toward whichever
 * exploration path the reader is considering. Reduced-motion aware throughout.
 */

import { useState, type ReactNode, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useHashScroll } from "../hooks/useHashScroll";
import { api } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS } from "../lib/constants";
import { useLanguage } from "../lib/language";
import { CurrentFlow, BackgroundCurrent, WaveUnderline } from "../components/current/CurrentFlow";
import { Waypoint } from "../components/Waypoint";
import { ReadingPrimer } from "../components/ReadingPrimer";
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
  const { mode, lex } = useLanguage();
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
        <div style={{ background: ZONE_COLORS.E0, ...seg(s.workers_e0, 0) }} title={mode === "plain" ? lex.zoneLabels.E0 : `E0 — ${lex.zoneLabels.E0} (dry)`} />
        <div style={{ background: ZONE_COLORS.E1, ...seg(s.workers_e1, 1) }} title={mode === "plain" ? lex.zoneLabels.E1 : `E1 — ${lex.zoneLabels.E1} (at the line)`} />
        <div style={{ background: ZONE_COLORS.E2, ...seg(s.workers_e2, 2) }} title={mode === "plain" ? lex.zoneLabels.E2 : `E2 — ${lex.zoneLabels.E2} (submerged)`} />
      </div>
      <div style={{ width: 52, fontFamily: TYPE.mono, fontSize: 13, color: t.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        {lex.fmt.scoreShort(s.avg_eloundou_beta ?? 0)}
      </div>
    </div>
  );
}

// The three currents = the three questions a first-time visitor actually
// arrives with (my role · my industry · where it's heading). This makes
// "Three currents to follow" literal, and answers the reader's own question
// before pointing at the documentation (which moves to a quiet link row below).
const pathsFor = (
  plain: boolean,
): { to: string; Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>; title: string; blurb: string }[] => [
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
    blurb: plain
      ? "See which industries are most exposed to AI — and which are least."
      : "See which industries sit deepest — and which are still on dry ground.",
  },
  {
    to: "/tide",
    Icon: IconTide,
    title: plain ? "Follow the trends" : "Watch the tide",
    blurb: plain
      ? "Which tasks are seeing the fastest growth in AI use, model generation over generation."
      : "Which tasks are rising fastest, era over era — the reading this site is named for.",
  },
];

// ── The four narrative beats: phenomenon → agency → high ground → instrument.
// Plain mode tells the same arc in ordinary words; nautical is the original
// brand narrative (#79 — the language trial's two arms). ──
const beatsFor = (plain: boolean): { waypoint?: string; line: ReactNode }[] =>
  plain
    ? [
        {
          waypoint: "WHAT'S HAPPENING",
          line: (
            <>AI capability is rising through the tasks that make up every job — not evenly, and not all at once.</>
          ),
        },
        {
          line: (
            <>This is something you can <strong style={{ color: t.brass }}>read and act on</strong>. Understand it well, and it works in your favour.</>
          ),
        },
        {
          waypoint: "WHAT STAYS HUMAN",
          line: (
            <>Some tasks become automatable. The skills that stay human — judgment, care, direction — are where your value grows. <strong>That's where you're headed.</strong></>
          ),
        },
        {
          line: (
            <>This is AI exposure, measured — across sectors, occupations, and 19,000 tasks. Read it, then decide what to do.</>
          ),
        },
      ]
    : [
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
  const { mode, lex } = useLanguage();
  const plain = mode === "plain";
  const BEATS = beatsFor(plain);
  const PATHS = pathsFor(plain);
  const { data } = useApi(() => api.sectors("US"), []);
  const sectors = [...(data?.sectors ?? [])].sort(
    (a, b) => (b.avg_eloundou_beta ?? 0) - (a.avg_eloundou_beta ?? 0),
  );
  const chart = useReveal();
  const [hoveredPath, setHoveredPath] = useState(-1);
  const [heroQuery, setHeroQuery] = useState("");
  const [heroFocused, setHeroFocused] = useState(false);
  const navigate = useNavigate();

  // The transactional visitor's first question is "what's happening to MY
  // job?" — give that an answer before the narrative, not after it (review:
  // "the product delays the user's first personal answer").
  const submitHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroQuery.trim().length < 2) return;
    navigate(`/search?q=${encodeURIComponent(heroQuery.trim())}`);
  };
  // Bearing convention (motion.ts): left option bends the current left, etc.
  const pathsBearing = hoveredPath === -1 ? 0 : (hoveredPath - 1) * 26;

  // Hash deep-links (e.g. the data pages' "Learn to read the scale →") land
  // scrolled to their section (shared hook — MethodologyPage uses it too).
  useHashScroll();

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
              {plain
                ? "AI capability is rising through the work we do. See where it sits today, where it's heading — and the skills that keep you ahead of it."
                : "AI capability is rising like a waterline across the work we do. See where it sits today, where it's heading — and the skills that keep you above it."}
            </p>

            {/* Primary path: search your role right here — the narrative below
                is still here for whoever wants it, but it's no longer required
                before a first-time visitor gets an answer. */}
            <form
              onSubmit={submitHeroSearch}
              style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 32, width: "100%", maxWidth: 480 }}
            >
              <input
                type="text"
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                onFocus={() => setHeroFocused(true)}
                onBlur={() => setHeroFocused(false)}
                placeholder="Your job title… e.g. 'Account Manager'"
                aria-label="Search for your role"
                style={{
                  flex: 1, minWidth: 220, padding: "13px 18px", fontSize: 16, borderRadius: 10,
                  border: `1.5px solid ${heroFocused ? t.brass : t.line}`, outline: "none",
                  fontFamily: TYPE.body, color: t.ink, background: t.surface,
                  transition: `border-color ${DUR.hover}ms ${EASE}`,
                }}
              />
              <button
                type="submit"
                disabled={heroQuery.trim().length < 2}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "13px 24px", fontSize: 15, fontWeight: 600, borderRadius: 10,
                  border: "none", backgroundColor: t.brass, color: "#fff",
                  cursor: heroQuery.trim().length < 2 ? "default" : "pointer",
                  opacity: heroQuery.trim().length < 2 ? 0.5 : 1, fontFamily: TYPE.body,
                }}
              >
                <IconSearch size={16} /> Find my role
              </button>
            </form>

            <button
              onClick={() =>
                document.getElementById("the-current")?.scrollIntoView({
                  behavior: prefersReducedMotion() ? "auto" : "smooth",
                  block: "start",
                })
              }
              style={{
                marginTop: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
              }}
            >
              <span style={{ position: "relative", display: "inline-block", paddingBottom: 4 }}>
                <span style={{ color: t.brass, fontSize: 15, fontWeight: 700, fontFamily: TYPE.mono, letterSpacing: 3 }}>
                  {plain ? "SEE HOW IT'S MEASURED" : "UNDERSTAND THE WATERLINE"}
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
          Every task gets a reading
        </h2>
        <p style={{ color: t.inkMuted, fontSize: 15, maxWidth: 640, marginTop: 0, marginBottom: 20 }}>
          {plain ? (
            <>
              SkillCurrent measures work at the task level: one
              <strong style={{ color: t.brass }}> exposure score</strong> places each task on
              a shared scale. Three things to know, then read it yourself.
            </>
          ) : (
            <>
              SkillCurrent measures work at the task level: one exposure reading —
              <strong style={{ color: t.brass }}> β</strong>, beta — places each task on
              a shared scale. Three things to know, then read it yourself.
            </>
          )}
        </p>
        <ReadingPrimer />
        <ZoneExplorer />
      </section>

      {/* ── THE TIDE OVER TIME: the temporal dimension — what an "era" is and
          why the waterline keeps climbing. The spatial views (tank, sectors)
          show one frame; this shows the motion between frames. ── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "12px 32px 48px" }}>
        <Reveal>
          <Waypoint>{plain ? "CHANGE OVER TIME" : "THE TIDE OVER TIME"}</Waypoint>
          <h2 style={{ fontFamily: TYPE.display, fontSize: 30, fontWeight: 600, margin: "0 0 6px" }}>
            {plain ? "Why AI exposure keeps rising" : "Why the waterline keeps rising"}
          </h2>
          <p style={{ color: t.inkMuted, fontSize: 15, maxWidth: 640, marginTop: 0, marginBottom: 18 }}>
            {plain ? (
              <>
                An <strong style={{ color: t.brass }}>era</strong> is a model generation — and they now
                arrive in <strong>months, not decades</strong>. Each new frontier model raises what AI
                can do, and work that sat safely out of reach becomes automatable. That's the change
                these pages measure — an order of magnitude faster than past technological shifts,
                and never backward.
              </>
            ) : (
              <>
                An <strong style={{ color: t.brass }}>era</strong> is a model generation — and they now
                arrive in <strong>months, not decades</strong>. Each new frontier model lifts the waterline,
                and work that sat safely above it slips under. That's the current these pages measure —
                rising an order of magnitude faster than past technological shifts, and never backward.
              </>
            )}
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
          <Waypoint>{plain ? "AI EXPOSURE, TODAY" : "THE WATERLINE, TODAY"}</Waypoint>
          <h2 style={{ fontFamily: TYPE.display, fontSize: 30, fontWeight: 600, margin: "0 0 6px" }}>
            {plain ? "AI exposure across sectors" : "The waterline across sectors"}
          </h2>
          <p style={{ color: t.inkMuted, fontSize: 15, maxWidth: 640, marginTop: 0 }}>
            {plain
              ? "Each bar is a sector's workforce, split by how far AI capability reaches into its tasks — highly automatable, AI-assisted, or still mostly human. Sorted by exposure."
              : "Each bar is a sector's workforce, split by how deep AI capability has risen through its tasks — submerged, at the line, or still dry. Sorted by exposure."}
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
                  {lex.zoneLabels[z]}
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
          <Waypoint center>{plain ? "WHERE TO START" : "CHOOSE YOUR COURSE"}</Waypoint>
          <div style={{ textAlign: "center", fontFamily: TYPE.display, fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
            {plain ? "Three ways in" : "Three currents to follow"}
          </div>
          <div style={{ textAlign: "center", fontSize: 14.5, color: t.inkMuted, marginBottom: 8, maxWidth: 540, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
            {plain
              ? "Start wherever your question is — your role, your industry, or where it's all heading."
              : "Three ways to read the water — start wherever your question is."}
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
