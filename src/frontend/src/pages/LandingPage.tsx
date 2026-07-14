/** SkillCurrent landing — narrative scroll that flows into the live waterline
 * chart (design option 7a). "The Current" motion guides the eye downward and
 * offers branching paths to explore. Reduced-motion aware.
 */

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS, ZONE_LABELS } from "../lib/constants";

const t = THEME.light;

// ── Scroll-reveal wrapper (fade + rise when scrolled into view) ──
function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── The Current: flowing vertical streamlines that guide the eye down ──
function CurrentGuide() {
  return (
    <svg width="100%" height="140" viewBox="0 0 200 140" preserveAspectRatio="none" aria-hidden="true">
      {[40, 100, 160].map((x, i) => (
        <path
          key={x}
          className="sc-stream"
          d={`M${x},-10 C${x - 14},30 ${x + 14},70 ${x},110 S${x - 10},150 ${x},190`}
          fill="none"
          stroke={t.brass}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={0.35}
          style={{ animationDelay: `${i * 0.6}s` }}
        />
      ))}
    </svg>
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

function WaterlineBar({ s }: { s: Sector }) {
  const total = Math.max(1, s.workers_e0 + s.workers_e1 + s.workers_e2);
  const seg = (n: number) => `${(n / total) * 100}%`;
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
        {/* submerged → at-line → dry (E2 | E1 | E0) */}
        <div style={{ width: seg(s.workers_e2), background: ZONE_COLORS.E2 }} title={`${ZONE_LABELS.E2} (automated)`} />
        <div style={{ width: seg(s.workers_e1), background: ZONE_COLORS.E1 }} title={`${ZONE_LABELS.E1} (augmented)`} />
        <div style={{ width: seg(s.workers_e0), background: ZONE_COLORS.E0 }} title={`${ZONE_LABELS.E0} (insulated)`} />
      </div>
      <div style={{ width: 52, fontFamily: TYPE.mono, fontSize: 13, color: t.inkMuted, fontVariantNumeric: "tabular-nums" }}>
        β{(s.avg_eloundou_beta ?? 0).toFixed(2)}
      </div>
    </div>
  );
}

const PATHS = [
  {
    to: "/occupations",
    icon: "⛰",
    title: "Explore skills",
    blurb: "Find the high ground — which human skills keep work above the rising line.",
  },
  {
    to: "/methodology",
    icon: "⚓",
    title: "How this works",
    blurb: "The pipeline from occupational data and research to a single exposure signal.",
  },
  {
    to: "/sources",
    icon: "📖",
    title: "What's the data",
    blurb: "Every signal, its vintage, licence, and how current it is. Open by design.",
  },
];

export function LandingPage() {
  const { data } = useApi(() => api.sectors("US"), []);
  const sectors = [...(data?.sectors ?? [])].sort(
    (a, b) => (b.avg_eloundou_beta ?? 0) - (a.avg_eloundou_beta ?? 0),
  );

  return (
    <div style={{ margin: -32, color: t.ink, fontFamily: TYPE.body }}>
      <style>{`
        @keyframes sc-flow { to { stroke-dashoffset: -220; } }
        @keyframes sc-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(7px); } }
        .sc-stream { stroke-dasharray: 10 210; animation: sc-flow 3.4s linear infinite; }
        .sc-bob { animation: sc-bob 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .sc-stream, .sc-bob { animation: none; }
        }
      `}</style>

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
        <h1 style={{ fontFamily: TYPE.display, fontSize: "clamp(38px, 7vw, 62px)", fontWeight: 600, margin: 0, letterSpacing: -1, lineHeight: 1.05 }}>
          Skill<span style={{ color: t.brass }}>Current</span>
        </h1>
        <p style={{ maxWidth: 560, fontSize: "clamp(16px, 2.4vw, 19px)", lineHeight: 1.5, color: t.inkMuted, marginTop: 20 }}>
          AI capability is rising like a waterline across the work we do. See where
          it sits today, where it's heading — and how to navigate it.
        </p>
        <div style={{ width: 220, marginTop: 8 }}>
          <CurrentGuide />
        </div>
        <div className="sc-bob" style={{ color: t.brass, fontSize: 13, fontFamily: TYPE.mono, letterSpacing: 1 }}>
          scroll ↓
        </div>
      </section>

      {/* ── Narrative beats ── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px" }}>
        {[
          <>A <strong style={{ color: t.brass }}>current</strong> is something you read and navigate — not a flood you flee.</>,
          <>Some tasks slip below the line. Others stay dry. <strong>Human skills are the high ground.</strong></>,
          <>SkillCurrent maps where the waterline sits today, and where it's rising next.</>,
        ].map((line, i) => (
          <Reveal key={i} delay={i * 60}>
            <p
              style={{
                fontFamily: TYPE.display,
                fontSize: 30,
                lineHeight: 1.35,
                color: t.ink,
                padding: "80px 0",
                margin: 0,
                textAlign: "center",
              }}
            >
              {line}
            </p>
          </Reveal>
        ))}
      </section>

      {/* ── The live waterline chart ── */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "24px 32px 60px" }}>
        <Reveal>
          <div style={{ fontFamily: TYPE.mono, fontSize: 12, letterSpacing: 1.5, color: t.inkMuted }}>THE WATERLINE, TODAY</div>
          <h2 style={{ fontFamily: TYPE.display, fontSize: 30, fontWeight: 600, margin: "6px 0 6px" }}>
            The waterline across sectors
          </h2>
          <p style={{ color: t.inkMuted, fontSize: 15, maxWidth: 640, marginTop: 0 }}>
            Each bar is a sector's workforce, split by how deep AI capability has
            risen through its tasks — submerged, at the line, or still dry. Sorted
            by exposure.
          </p>

          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: "22px 24px", marginTop: 18 }}>
            {sectors.map((s) => (
              <WaterlineBar key={s.naics_code} s={s} />
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

      {/* ── Exploration paths ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "20px 32px 90px" }}>
        <Reveal>
          <div style={{ textAlign: "center", fontFamily: TYPE.display, fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
            Choose your course
          </div>
          <p style={{ textAlign: "center", color: t.inkMuted, fontSize: 15, marginTop: 0, marginBottom: 28 }}>
            Three currents to follow.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
            {PATHS.map((p) => (
              <Link
                key={p.to}
                to={p.to}
                style={{
                  display: "block",
                  textDecoration: "none",
                  background: t.surface,
                  border: `1px solid ${t.line}`,
                  borderRadius: 10,
                  padding: "22px 20px",
                  color: t.ink,
                  transition: "border-color 0.15s ease, transform 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = t.brass;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = t.line;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 10 }}>{p.icon}</div>
                <div style={{ fontFamily: TYPE.display, fontSize: 19, fontWeight: 600, marginBottom: 6 }}>{p.title}</div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: t.inkMuted }}>{p.blurb}</div>
                <div style={{ marginTop: 12, color: t.brass, fontSize: 13, fontWeight: 600 }}>Follow →</div>
              </Link>
            ))}
          </div>
        </Reveal>
      </section>
    </div>
  );
}
