/**
 * ZoneExplorer — the interactive Beta/exposure-zone teaching instrument.
 *
 * Lives on the LANDING page (the "READ THE SCALE" section) — the one teaching
 * home for the platform's core concept (design 7a+7b combo). Data pages embed
 * the slim `ZoneLegend` instead, which links back here.
 *
 * Three layers, abstract → concrete:
 *   1. BetaGauge — drag the scale itself.
 *   2. WorkedExample — a REAL, recognizable job broken into its actual tasks,
 *      each plotted on the scale, so Beta stops being abstract: you see the
 *      paperwork sink and the human moments stay dry. Pick a job you know.
 *   3. Zone definition cards — what E0/E1/E2 mean.
 *
 * The gauge uses BETA_SCALE/ZONE_THRESHOLDS — the same tokens the app's
 * zone-classification logic uses, so the instrument and the real scale are the
 * same numbers. Worked-example task positions are representative (curated for
 * the landing); the live per-task reading is on each occupation's own page.
 */

import { useState, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { ZONE_COLORS, ZONE_BG, ZONE_LABELS, THEME, TYPE, BETA_SCALE, ZONE_THRESHOLDS, BRASS_TINT } from "../lib/constants";
import { DUR, EASE, prefersReducedMotion, ensureMotionStyles } from "./current/motion";

const t = THEME.light;

export const ZONE_DATA = [
  {
    key: "E0" as const,
    threshold: "Beta < 0.40",
    shortThreshold: "<0.40",
    headline: "Human-only work",
    description:
      "Tasks unlikely to be impacted by AI in the near term. Human-only work with supporting systems and processes.",
    implication: "Focus: preserve and invest in these distinctly human capabilities.",
    sample: 0.2,
  },
  {
    key: "E1" as const,
    threshold: "Beta 0.40–0.85",
    shortThreshold: "0.40–0.85",
    headline: "AI assists, human leads",
    description:
      "Co-pilot workflows where AI handles routine subtasks while humans provide judgment, creativity, and oversight.",
    implication: "Focus: upskill workers to collaborate effectively with AI tools.",
    sample: 0.6,
  },
  {
    key: "E2" as const,
    threshold: "Beta ≥ 0.85",
    shortThreshold: "≥0.85",
    headline: "AI performs, human validates",
    description:
      "Tasks that can be substantially automated or delegated to AI agents. Humans shift to quality assurance and exception handling.",
    implication: "Focus: redesign roles around oversight, exceptions, and new value creation.",
    sample: 1.05,
  },
] as const;

type ZoneKey = (typeof ZONE_DATA)[number]["key"];

function zoneOf(beta: number): ZoneKey {
  if (beta >= ZONE_THRESHOLDS.E2) return "E2";
  if (beta >= ZONE_THRESHOLDS.E1) return "E1";
  return "E0";
}

const pctOfScale = (v: number) => Math.max(0, Math.min(100, (v / BETA_SCALE.max) * 100));

// ── Worked examples: super-common roles, everyday tasks, positioned by
// exposure. Representative (curated) — the live per-task reading is on each
// occupation's page. Chosen to span the scale, so the spread is the lesson:
// documentation/routine sinks, human contact stays dry. ──
// A few — so there's always one you recognize — shown together, each with 3
// tasks spanning the scale (a routine end, a middle, and a human end).
const ROLE_EXAMPLES = [
  {
    soc: "29-1141.00",
    title: "Registered Nurse",
    takeaway: "Charting sinks; bedside care stays human.",
    tasks: [
      { text: "Chart patient vitals and update records", beta: 0.88 },
      { text: "Administer medications and treatments", beta: 0.47 },
      { text: "Comfort and reassure patients and families", beta: 0.13 },
    ],
  },
  {
    soc: "41-2011.00",
    title: "Cashier",
    takeaway: "Scanning's nearly gone; defusing conflict isn't.",
    tasks: [
      { text: "Scan items and total the purchase", beta: 0.9 },
      { text: "Answer questions about products and prices", beta: 0.54 },
      { text: "De-escalate an upset customer", beta: 0.22 },
    ],
  },
  {
    soc: "43-3031.00",
    title: "Bookkeeper",
    takeaway: "Data entry automates; the judgment call doesn't.",
    tasks: [
      { text: "Enter transactions into the ledger", beta: 0.93 },
      { text: "Generate monthly financial reports", beta: 0.67 },
      { text: "Advise on bookkeeping practices", beta: 0.27 },
    ],
  },
  {
    soc: "25-2021.00",
    title: "Primary Teacher",
    takeaway: "Grading speeds up; mentoring stays human.",
    tasks: [
      { text: "Grade assignments and quizzes", beta: 0.78 },
      { text: "Explain new concepts to the class", beta: 0.43 },
      { text: "Encourage and mentor struggling students", beta: 0.11 },
    ],
  },
  {
    soc: "53-3032.00",
    title: "Truck Driver",
    takeaway: "The paperwork sinks; the driving stays.",
    tasks: [
      { text: "Complete delivery logs and paperwork", beta: 0.82 },
      { text: "Plan the day's delivery route", beta: 0.58 },
      { text: "Drive the vehicle safely in traffic", beta: 0.14 },
    ],
  },
  {
    soc: "43-4051.00",
    title: "Customer Service Rep",
    takeaway: "Looking things up automates; the hard calls don't.",
    tasks: [
      { text: "Look up account details and order status", beta: 0.85 },
      { text: "Answer routine product questions", beta: 0.6 },
      { text: "Calm a frustrated customer and find a fix", beta: 0.2 },
    ],
  },
];

/** The three zone bands with one dot per beta. Used both for the compact role
 * "signature" in the browse chips (teaser) and the focus panel's task rows. */
function ScaleTrack({ betas, height = 8, dot = 10 }: { betas: number[]; height?: number; dot?: number }) {
  const e1 = pctOfScale(ZONE_THRESHOLDS.E1);
  const e2 = pctOfScale(ZONE_THRESHOLDS.E2);
  const rad = height / 2;
  return (
    <div style={{ position: "relative", height, borderRadius: rad, display: "flex", overflow: "visible", border: `1px solid ${t.line}` }}>
      <div style={{ width: `${e1}%`, background: ZONE_BG.E0, borderRadius: `${rad}px 0 0 ${rad}px` }} />
      <div style={{ width: `${e2 - e1}%`, background: ZONE_BG.E1 }} />
      <div style={{ width: `${100 - e2}%`, background: ZONE_BG.E2, borderRadius: `0 ${rad}px ${rad}px 0` }} />
      {betas.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${pctOfScale(b)}%`,
            top: "50%",
            width: dot,
            height: dot,
            borderRadius: "50%",
            background: ZONE_COLORS[zoneOf(b)],
            border: `${dot < 9 ? 1.5 : 2}px solid ${t.surface}`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}

/** A small role "signature" — the 3-dot shape teaser inside each browse chip.
 * Shows at a glance how much of a role sinks vs stays dry, inviting a click. */
function RoleSignature({ role }: { role: (typeof ROLE_EXAMPLES)[number] }) {
  return <ScaleTrack betas={role.tasks.map((task) => task.beta)} height={6} dot={7} />;
}

/** WorkedExample — "make Beta real": focus on ONE recognizable job's tasks on the
 * scale, with a rail of the other roles (each previewing its shape) to browse. */
function WorkedExample() {
  const [idx, setIdx] = useState(0);
  const count = ROLE_EXAMPLES.length;
  const role = ROLE_EXAMPLES[idx];
  const animate = !prefersReducedMotion();

  useEffect(() => {
    ensureMotionStyles();
  }, []);

  const go = (delta: number) => setIdx((i) => (i + delta + count) % count);

  const e1 = pctOfScale(ZONE_THRESHOLDS.E1);
  const e2 = pctOfScale(ZONE_THRESHOLDS.E2);

  const arrowBtn = (label: string, onClick: () => void, title: string) => (
    <button
      onClick={onClick}
      aria-label={title}
      title={title}
      style={{
        width: 26, height: 26, borderRadius: 7, border: `1px solid ${t.line}`,
        background: t.surface, color: t.inkMuted, cursor: "pointer",
        fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, marginBottom: 4 }}>
        See where one job's tasks land — then browse the others
      </div>
      <div style={{ fontSize: 12, color: t.inkMuted, marginBottom: 14 }}>
        Every job splits across the scale: the routine parts sink toward automation,
        the human parts stay dry. That spread — not a single score — is what
        SkillCurrent measures.
      </div>

      {/* Focus panel — the one role in view, big and legible */}
      <div
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, padding: "18px 20px", outline: "none" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <Link
              to={`/occupations?selected=${role.soc}`}
              title={`See ${role.title}'s full task breakdown`}
              style={{ fontFamily: TYPE.display, fontSize: 21, fontWeight: 600, color: t.ink, textDecoration: "none", letterSpacing: -0.3 }}
            >
              {role.title}
            </Link>
            <div style={{ fontSize: 12.5, color: t.inkMuted, fontStyle: "italic", marginTop: 3 }}>{role.takeaway}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {arrowBtn("‹", () => go(-1), "Previous role")}
            <span style={{ fontFamily: TYPE.mono, fontSize: 12, color: t.inkMuted, minWidth: 34, textAlign: "center" }}>
              {idx + 1} / {count}
            </span>
            {arrowBtn("›", () => go(1), "Next role")}
          </div>
        </div>

        {/* Shared scale header — calibrate once; task tracks align to it */}
        <div style={{ position: "relative", height: 16, marginTop: 16 }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", fontSize: 9.5, fontWeight: 600 }}>
            <div style={{ width: `${e1}%`, color: ZONE_COLORS.E0 }}>{ZONE_LABELS.E0}</div>
            <div style={{ width: `${e2 - e1}%`, color: ZONE_COLORS.E1, textAlign: "center" }}>{ZONE_LABELS.E1}</div>
            <div style={{ width: `${100 - e2}%`, color: ZONE_COLORS.E2, textAlign: "right" }}>{ZONE_LABELS.E2}</div>
          </div>
        </div>

        {/* The role's tasks — keyed so switching plays a gentle fade-rise */}
        <div
          key={idx}
          style={{
            display: "flex", flexDirection: "column", gap: 14, marginTop: 4,
            animation: animate ? `sc-fade-rise ${DUR.bearing}ms ${EASE}` : undefined,
          }}
        >
          {role.tasks.map((task) => {
            const zone = zoneOf(task.beta);
            return (
              <div key={task.text}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 13.5, color: t.ink, lineHeight: 1.3 }}>{task.text}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0, fontFamily: TYPE.mono }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: ZONE_COLORS[zone] }}>{task.beta.toFixed(2)}</span>
                    <span style={{ fontSize: 10.5, color: ZONE_COLORS[zone], opacity: 0.85 }}>{ZONE_LABELS[zone]}</span>
                  </span>
                </div>
                <ScaleTrack betas={[task.beta]} height={13} dot={13} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Browse rail — every other role's shape, click to bring into focus */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: t.inkMuted, marginBottom: 8 }}>
          Explore {count} everyday jobs — each preview shows its shape on the scale:
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ROLE_EXAMPLES.map((r, i) => {
            const active = i === idx;
            return (
              <button
                key={r.soc}
                onClick={() => setIdx(i)}
                aria-pressed={active}
                title={`Focus on ${r.title}`}
                style={{
                  flex: "1 1 150px", minWidth: 140, maxWidth: 220, textAlign: "left",
                  display: "flex", flexDirection: "column", gap: 7, padding: "9px 11px",
                  borderRadius: 9, cursor: "pointer",
                  background: active ? BRASS_TINT : t.surface,
                  border: `1px solid ${active ? t.brass : t.line}`,
                  boxShadow: active ? `0 0 0 1px ${t.brass}` : "none",
                  transition: `background ${DUR.hover}ms ${EASE}, border-color ${DUR.hover}ms ${EASE}`,
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: active ? t.brass : t.ink, lineHeight: 1.2 }}>
                  {r.title}
                </span>
                <RoleSignature role={r} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 10.5, color: t.inkMuted, fontStyle: "italic" }}>
        Representative tasks, positioned by their AI exposure — the focused role links to its live per-task breakdown.
      </div>
    </div>
  );
}

/** An interactive Beta gauge — drag or click to "try" a value and see its zone. */
function BetaGauge({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const e1Start = pctOfScale(ZONE_THRESHOLDS.E1);
  const e2Start = pctOfScale(ZONE_THRESHOLDS.E2);
  const medianPct = pctOfScale(BETA_SCALE.median);
  const valuePct = pctOfScale(value);
  const active = zoneOf(value);

  function setFromClientX(clientX: number, rect: DOMRect) {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(Math.round(ratio * BETA_SCALE.max * 100) / 100);
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return;
    setFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>Try it — drag to read the scale</span>
        <span style={{ fontFamily: TYPE.mono, fontSize: 13, fontWeight: 700, color: ZONE_COLORS[active] }}>
          β {value.toFixed(2)} → {ZONE_LABELS[active]}
        </span>
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        role="slider"
        aria-label="Beta value"
        aria-valuemin={BETA_SCALE.min}
        aria-valuemax={BETA_SCALE.max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onChange(Math.min(BETA_SCALE.max, value + 0.05));
          if (e.key === "ArrowLeft") onChange(Math.max(BETA_SCALE.min, value - 0.05));
        }}
        style={{
          position: "relative",
          height: 26,
          borderRadius: 6,
          overflow: "visible",
          cursor: "pointer",
          display: "flex",
          border: `1px solid ${t.line}`,
          touchAction: "none",
        }}
      >
        <div style={{ width: `${e1Start}%`, background: ZONE_BG.E0, borderRadius: "5px 0 0 5px" }} />
        <div style={{ width: `${e2Start - e1Start}%`, background: ZONE_BG.E1 }} />
        <div style={{ width: `${100 - e2Start}%`, background: ZONE_BG.E2, borderRadius: "0 5px 5px 0" }} />

        {/* Median reference tick */}
        <div
          title={`Median β ${BETA_SCALE.median}`}
          style={{ position: "absolute", left: `${medianPct}%`, top: -3, bottom: -3, width: 1, background: t.inkMuted, opacity: 0.5 }}
        />

        {/* Draggable handle — the brass instrument reading the current */}
        <div
          style={{
            position: "absolute",
            left: `${valuePct}%`,
            top: -4,
            bottom: -4,
            width: 4,
            background: t.brass,
            borderRadius: 2,
            transform: "translateX(-2px)",
            boxShadow: `0 0 0 2px ${t.surface}`,
            transition: "left 0.15s ease",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: TYPE.mono, color: t.inkMuted, marginTop: 5 }}>
        <span>0</span>
        <span>0.40</span>
        <span>0.85</span>
        <span>1.5</span>
      </div>
    </div>
  );
}

/** The inline explorer — the landing's "READ THE SCALE" instrument. */
export function ZoneExplorer() {
  const [betaValue, setBetaValue] = useState<number>(BETA_SCALE.median);
  const activeZone = zoneOf(betaValue);

  return (
    <div style={{ fontFamily: TYPE.body }}>
      {/* 1. The gauge, on a surface card so it reads over the ground/current */}
      <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, padding: "18px 20px 14px" }}>
        <BetaGauge value={betaValue} onChange={setBetaValue} />
      </div>

      {/* 2. A real job on the scale — makes Beta concrete */}
      <WorkedExample />

      {/* 3. Three zone cards — highlight in sync with the gauge; click to jump the gauge */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        {ZONE_DATA.map((zone) => {
          const isActive = zone.key === activeZone;
          return (
            <div
              key={zone.key}
              role="button"
              tabIndex={0}
              onClick={() => setBetaValue(zone.sample)}
              onKeyDown={(e) => e.key === "Enter" && setBetaValue(zone.sample)}
              style={{
                flex: 1,
                minWidth: 220,
                borderRadius: 8,
                borderLeft: `4px solid ${ZONE_COLORS[zone.key]}`,
                borderTop: `1px solid ${isActive ? ZONE_COLORS[zone.key] : t.line}`,
                borderRight: `1px solid ${isActive ? ZONE_COLORS[zone.key] : t.line}`,
                borderBottom: `1px solid ${isActive ? ZONE_COLORS[zone.key] : t.line}`,
                backgroundColor: ZONE_BG[zone.key],
                padding: "16px 16px 14px",
                cursor: "pointer",
                boxShadow: isActive ? `0 0 0 2px ${ZONE_COLORS[zone.key]}30` : "none",
                transition: "box-shadow 0.15s ease, border-color 0.15s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: ZONE_COLORS[zone.key] }}>
                  {zone.key} — {ZONE_LABELS[zone.key]}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: ZONE_COLORS[zone.key],
                    backgroundColor: `${ZONE_COLORS[zone.key]}18`,
                    padding: "2px 8px",
                    borderRadius: 99,
                    fontFamily: TYPE.mono,
                  }}
                >
                  {zone.threshold}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, marginBottom: 6 }}>{zone.headline}</div>
              <div style={{ fontSize: 12, color: t.inkMuted, lineHeight: 1.5 }}>{zone.description}</div>
              <div style={{ fontSize: 11, color: t.inkMuted, fontStyle: "italic", marginTop: 8, lineHeight: 1.4 }}>
                {zone.implication}
              </div>
            </div>
          );
        })}
      </div>

      {/* Honesty footer */}
      <div style={{ fontSize: 11, color: t.inkMuted, fontStyle: "italic", textAlign: "center", marginTop: 14 }}>
        Beta = E1 + 0.5×E2 (Eloundou 2024). No occupation has all tasks affected —
        most roles blend all three zones.
      </div>
    </div>
  );
}

/** Slim zone legend for data pages — pips + thresholds + a link to the one
 * teaching home (the landing's READ THE SCALE section). */
export function ZoneLegend() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        padding: "10px 16px",
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        fontFamily: TYPE.body,
        fontSize: 12.5,
        color: t.inkMuted,
      }}
    >
      {ZONE_DATA.map((zone) => (
        <span key={zone.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            title={`${zone.key} — ${ZONE_LABELS[zone.key]}`}
            style={{ width: 9, height: 9, borderRadius: "50%", background: ZONE_COLORS[zone.key], flexShrink: 0 }}
          />
          <span style={{ fontWeight: 600, color: t.ink }}>{ZONE_LABELS[zone.key]}</span>
          <span style={{ fontFamily: TYPE.mono, fontSize: 11.5 }}>{zone.shortThreshold}</span>
        </span>
      ))}
      <Link
        to="/#read-the-scale"
        style={{ marginLeft: "auto", color: t.brass, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
      >
        Learn to read the scale →
      </Link>
    </div>
  );
}
