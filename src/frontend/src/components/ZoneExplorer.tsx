/**
 * ZoneExplorer — the interactive Beta/exposure-zone teaching instrument.
 *
 * Lives on the LANDING page (the "READ THE SCALE" section) — the one teaching
 * home for the platform's core concept (design 7a+7b combo). Data pages embed
 * the slim `ZoneLegend` instead, which links back here.
 *
 * One instrument, concrete → abstract:
 *   1. WorkedExample + WaterlineTank — a REAL, recognizable job's tasks on ONE
 *      vertical exposure grid, with a DRAGGABLE waterline. The scale and the
 *      tasks are the same picture: β stays put, the water rises, and you watch
 *      which of the job's tasks the tide reaches. A rail browses other roles.
 *   2. Zone definition cards — what E0/E1/E2 mean; they highlight with the
 *      waterline's current zone and set it when clicked.
 *
 * The tank uses BETA_SCALE/ZONE_THRESHOLDS — the same tokens the app's
 * zone-classification logic uses, so the instrument and the real scale are the
 * same numbers. Worked-example task positions are representative (curated for
 * the landing); the live per-task reading is on each occupation's own page.
 */

import { useState, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { ZONE_COLORS, ZONE_BG, ZONE_LABELS, THEME, TYPE, BETA_SCALE, ZONE_THRESHOLDS } from "../lib/constants";
import { DUR, EASE, prefersReducedMotion, ensureMotionStyles } from "./current/motion";
import { WaveUnderline } from "./current/CurrentFlow";

const t = THEME.light;

export const ZONE_DATA = [
  {
    key: "E0" as const,
    threshold: "Beta < 0.40",
    shortThreshold: "<0.40",
    headline: "Human-only work",
    short: "Preserve and invest in these distinctly human skills.",
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
    short: "Upskill people to work alongside AI on the routine parts.",
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
    short: "Redesign the role around oversight and exceptions.",
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


// ── Worked examples: super-common roles, everyday tasks, positioned by
// exposure. Representative (curated) — the live per-task reading is on each
// occupation's page. Chosen to span the scale, so the spread is the lesson:
// documentation/routine sinks, human contact stays dry. ──
// A few — so there's always one you recognize — each with 3 tasks spanning the
// scale (a routine end, a middle, and a human end) plus each task's `time`
// (share of the working day). The waterline is global (same tide for all jobs);
// browsing re-plots the tasks, so how much of each job sits under it changes.
const ROLE_EXAMPLES = [
  {
    soc: "29-1141.00",
    title: "Registered Nurse",
    takeaway: "Charting sinks; bedside care stays human.",
    tasks: [
      { text: "Chart patient vitals and update records", beta: 0.88, time: 20 },
      { text: "Administer medications and treatments", beta: 0.47, time: 35 },
      { text: "Comfort and reassure patients and families", beta: 0.13, time: 45 },
    ],
  },
  {
    soc: "41-2011.00",
    title: "Cashier",
    takeaway: "Scanning's nearly gone; defusing conflict isn't.",
    tasks: [
      { text: "Scan items and total the purchase", beta: 0.9, time: 55 },
      { text: "Answer questions about products and prices", beta: 0.54, time: 30 },
      { text: "De-escalate an upset customer", beta: 0.22, time: 15 },
    ],
  },
  {
    soc: "43-3031.00",
    title: "Bookkeeper",
    takeaway: "Data entry automates; the judgment call doesn't.",
    tasks: [
      { text: "Enter transactions into the ledger", beta: 0.93, time: 50 },
      { text: "Generate monthly financial reports", beta: 0.67, time: 30 },
      { text: "Advise on bookkeeping practices", beta: 0.27, time: 20 },
    ],
  },
  {
    soc: "25-2021.00",
    title: "Primary Teacher",
    takeaway: "Grading speeds up; mentoring stays human.",
    tasks: [
      { text: "Grade assignments and quizzes", beta: 0.78, time: 25 },
      { text: "Explain new concepts to the class", beta: 0.43, time: 40 },
      { text: "Encourage and mentor struggling students", beta: 0.11, time: 35 },
    ],
  },
  {
    soc: "53-3032.00",
    title: "Truck Driver",
    takeaway: "The paperwork sinks; the driving stays.",
    tasks: [
      { text: "Complete delivery logs and paperwork", beta: 0.82, time: 15 },
      { text: "Plan the day's delivery route", beta: 0.58, time: 20 },
      { text: "Drive the vehicle safely in traffic", beta: 0.14, time: 65 },
    ],
  },
  {
    soc: "43-4051.00",
    title: "Customer Service Rep",
    takeaway: "Looking things up automates; the hard calls don't.",
    tasks: [
      { text: "Look up account details and order status", beta: 0.85, time: 45 },
      { text: "Answer routine product questions", beta: 0.6, time: 30 },
      { text: "Calm a frustrated customer and find a fix", beta: 0.2, time: 25 },
    ],
  },
];

/** WorkedExample — "make Beta real": one recognizable job's tasks in the tank,
 * its name riding the current (a wave underline), and a flowing "Compare" row of
 * the other jobs (no boxes) to browse. Picking a job flows the tide to it. */
function WorkedExample({ waterline, onWaterline }: { waterline: number; onWaterline: (v: number) => void }) {
  const [idx, setIdx] = useState(0);
  const count = ROLE_EXAMPLES.length;
  const role = ROLE_EXAMPLES[idx];

  useEffect(() => {
    ensureMotionStyles();
  }, []);

  // The waterline is a single global "today's capability" (owned by ZoneExplorer)
  // — the SAME tide for every job. Browsing a role doesn't move it; it re-plots
  // the tasks, and how much of the job sits under the fixed line changes.
  const selectRole = (i: number) => setIdx(i);
  const go = (delta: number) => selectRole((idx + delta + count) % count);

  const others = ROLE_EXAMPLES.map((r, i) => ({ r, i })).filter((x) => x.i !== idx);

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      style={{ marginTop: 16, outline: "none" }}
    >
      <div style={{ fontSize: 12.5, color: t.inkMuted, marginBottom: 14, maxWidth: 520, lineHeight: 1.55 }}>
        Every job splits across the scale — the routine parts sink toward automation, the human
        parts stay dry. Watch the tide reach a real job; switch jobs to compare.
      </div>

      {/* Focused role — its name rides the current (the wave underline) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <Link
            to={`/occupations?selected=${role.soc}`}
            title={`See ${role.title}'s full task breakdown`}
            style={{ fontFamily: TYPE.display, fontSize: 23, fontWeight: 600, color: t.ink, textDecoration: "none", letterSpacing: -0.3 }}
          >
            {role.title}
          </Link>
          <WaveUnderline />
        </div>
        <Link
          to={`/occupations?selected=${role.soc}`}
          style={{ fontFamily: TYPE.mono, fontSize: 11, color: t.brass, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          all tasks →
        </Link>
      </div>
      <div style={{ fontSize: 12.5, color: t.inkMuted, fontStyle: "italic", marginTop: 9 }}>{role.takeaway}</div>

      {/* The tank — the role's tasks + the draggable waterline */}
      <WaterlineTank role={role} waterline={waterline} onChange={onWaterline} animKey={idx} />

      {/* Compare — the other jobs as flowing text on the current, not boxes */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 0", marginTop: 16, fontSize: 12.5 }}>
        <span style={{ color: t.inkMuted, marginRight: 6 }}>Compare</span>
        {others.map(({ r, i }, n) => (
          <span key={r.soc} style={{ display: "inline-flex", alignItems: "baseline" }}>
            {n > 0 && <span style={{ color: t.line, margin: "0 3px" }}>·</span>}
            <button
              onClick={() => selectRole(i)}
              title={`Switch to ${r.title}`}
              style={{
                border: "none", background: "none", cursor: "pointer", padding: "2px 3px",
                fontFamily: TYPE.body, fontSize: 12.5, fontWeight: 500, color: t.current,
              }}
            >
              {r.title}
            </button>
          </span>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 10.5, color: t.inkMuted, fontStyle: "italic" }}>
        Representative tasks, positioned by their AI exposure — the live per-task reading is on each job's own page.
      </div>
    </div>
  );
}

/** The waterline tank — a role's tasks on ONE vertical exposure grid, with a
 * draggable waterline that fills with water and submerges tasks as it rises.
 * This is the scale AND the tasks in one picture: β stays put, the water moves,
 * and you watch which of a real job's tasks the tide reaches. Dry (human-only)
 * sits at the top; submerged (automation) at the bottom — β increases downward. */
const TANK_H = 320;

function WaterlineTank({
  role,
  waterline,
  onChange,
  animKey,
}: {
  role: (typeof ROLE_EXAMPLES)[number];
  waterline: number;
  onChange: (v: number) => void;
  animKey: number;
}) {
  const yOf = (beta: number) => (beta / BETA_SCALE.max) * TANK_H;
  const y40 = yOf(ZONE_THRESHOLDS.E1);
  const y85 = yOf(ZONE_THRESHOLDS.E2);
  const wlY = yOf(waterline);
  const submergedTasks = role.tasks.filter((task) => task.beta >= waterline);
  const submerged = submergedTasks.length;
  // Time-weighted: the share of the working day below the line, not just a task
  // count — a highly automatable task can still be a small slice of the day.
  const dayTotal = role.tasks.reduce((s, task) => s + task.time, 0);
  const timeBelow = Math.round((submergedTasks.reduce((s, task) => s + task.time, 0) / dayTotal) * 100);
  const wlZone = zoneOf(waterline);
  const animate = !prefersReducedMotion();
  const wlTrans = animate ? `top ${DUR.hover}ms ${EASE}` : undefined;

  function setFromClientY(clientY: number, rect: DOMRect) {
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(Math.round(ratio * BETA_SCALE.max * 100) / 100);
  }
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientY(e.clientY, e.currentTarget.getBoundingClientRect());
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return;
    setFromClientY(e.clientY, e.currentTarget.getBoundingClientRect());
  }

  // Vertical span of each zone band (shared by the tank and the aligned rail).
  const bandOf = (key: ZoneKey) => ({
    top: key === "E0" ? 0 : key === "E1" ? y40 : y85,
    height: key === "E0" ? y40 : key === "E1" ? y85 - y40 : TANK_H - y85,
  });

  return (
    <div style={{ marginTop: 14 }}>
      {/* Two headers aligned to the columns — names each side so the role's
          live tank and the generic key read as clearly different things. */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 8 }}>
        <div style={{ flex: "1 1 320px", minWidth: 200, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>Drag the waterline</span>
          <span style={{ fontFamily: TYPE.mono, fontSize: 13, fontWeight: 700, color: ZONE_COLORS[wlZone] }}>
            β {waterline.toFixed(2)} · {timeBelow}% of the day below
            <span style={{ fontWeight: 400, color: t.inkMuted }}> ({submerged}/{role.tasks.length} tasks)</span>
          </span>
        </div>
        <div style={{ flex: "0 1 250px", minWidth: 180, maxWidth: 290 }}>
          <span style={{ fontFamily: TYPE.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.inkMuted }}>
            The key — what each zone means
          </span>
        </div>
      </div>

      {/* Tank + aligned zone rail — one instrument on a shared vertical axis:
          each description sits beside its band, so the tide points at it. */}
      <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        <div
          role="slider"
          aria-label="Waterline"
          aria-orientation="vertical"
          aria-valuemin={BETA_SCALE.min}
          aria-valuemax={BETA_SCALE.max}
          aria-valuenow={waterline}
          tabIndex={0}
          onPointerDown={down}
          onPointerMove={move}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") onChange(Math.round(Math.min(BETA_SCALE.max, waterline + 0.05) * 100) / 100);
            if (e.key === "ArrowUp") onChange(Math.round(Math.max(BETA_SCALE.min, waterline - 0.05) * 100) / 100);
          }}
          style={{
            position: "relative",
            flex: "1 1 320px",
            minWidth: 200,
            height: TANK_H,
            borderRadius: 8,
            overflow: "hidden",
            cursor: "ns-resize",
            border: `1px solid ${t.line}`,
            touchAction: "none",
          }}
        >
          {/* Zone bands — dry ground at top, deep water at bottom */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: y40, background: ZONE_BG.E0 }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: y40, height: y85 - y40, background: ZONE_BG.E1 }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: y85, bottom: 0, background: ZONE_BG.E2 }} />

          {/* Ground / water captions (the wireframe's "dry ground" / "submerged") */}
          <span style={{ position: "absolute", left: 8, top: 6, fontSize: 9, color: t.inkMuted }}>human-only · dry</span>
          <span style={{ position: "absolute", left: 8, bottom: 6, fontSize: 9, color: t.inkMuted }}>automation · submerged</span>

          {/* Water — fills from the waterline down; the moving hue (teal) */}
          <div
            style={{
              position: "absolute", left: 0, right: 0, top: wlY, bottom: 0,
              background: `${t.current}22`, pointerEvents: "none", transition: wlTrans,
            }}
          />

          {/* Task lines — fixed at their β height; keyed so a role swap fades in */}
          <div
            key={animKey}
            style={{ position: "absolute", inset: 0, animation: animate ? `sc-fade-rise ${DUR.bearing}ms ${EASE}` : undefined }}
          >
            {role.tasks.map((task) => {
              const zone = zoneOf(task.beta);
              const under = task.beta >= waterline;
              return (
                <div
                  key={task.text}
                  style={{
                    position: "absolute", left: 0, right: 0, top: yOf(task.beta),
                    transform: "translateY(-50%)", padding: "0 10px", pointerEvents: "none",
                  }}
                >
                  {/* Row 1 — exposure: task at its β height, β value at the right */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 11.5, lineHeight: 1.2, color: t.ink }}>{task.text}</span>
                    <span style={{ fontFamily: TYPE.mono, fontSize: 11.5, fontWeight: 700, color: ZONE_COLORS[zone], flexShrink: 0 }}>
                      {task.beta.toFixed(2)}
                      {under && <span style={{ fontWeight: 400, color: t.current, marginLeft: 4 }}>↓</span>}
                    </span>
                  </div>
                  {/* Row 2 — time: a bar whose LENGTH is this task's share of the day */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: `${ZONE_COLORS[zone]}20`, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${task.time}%`, background: ZONE_COLORS[zone], borderRadius: 4 }} />
                    </div>
                    <span style={{ fontFamily: TYPE.mono, fontSize: 9.5, color: t.inkMuted, flexShrink: 0, width: 58, textAlign: "right" }}>
                      {task.time}% of day
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* The waterline itself — the brass instrument line + grip */}
          <div style={{ position: "absolute", left: 0, right: 0, top: wlY, height: 0, borderTop: `2px solid ${t.brass}`, pointerEvents: "none", transition: wlTrans }}>
            <span style={{ position: "absolute", right: 6, top: -7, width: 22, height: 14, borderRadius: 4, background: t.brass, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: t.surface }}>≡</span>
          </div>
        </div>

        {/* Zone rail — each description aligned to its band; highlights with the
            waterline's zone, and clicking jumps the tide to that zone. */}
        <div style={{ position: "relative", flex: "0 1 250px", minWidth: 180, maxWidth: 290, height: TANK_H }}>
          {ZONE_DATA.map((zone) => {
            const band = bandOf(zone.key);
            const active = wlZone === zone.key;
            return (
              <div
                key={zone.key}
                role="button"
                tabIndex={0}
                onClick={() => onChange(zone.sample)}
                onKeyDown={(e) => e.key === "Enter" && onChange(zone.sample)}
                title={`Set the waterline into ${ZONE_LABELS[zone.key]}`}
                style={{
                  position: "absolute", top: band.top, height: band.height, left: 0, right: 0,
                  display: "flex", gap: 8, alignItems: "flex-start",
                  // A calm, always-readable reference legend. The only reaction to
                  // the waterline is a quiet brass tick on the current zone — no
                  // dimming, no jumping markers; the tank does the moving.
                  borderLeft: `2px solid ${active ? t.brass : "transparent"}`,
                  paddingLeft: 9, paddingTop: 6, paddingBottom: 6, paddingRight: 2,
                  cursor: "pointer", overflow: "hidden",
                  transition: `border-color ${DUR.hover}ms ${EASE}`,
                }}
              >
                {/* Small zone swatch — the only colour here; it ties this entry to
                    its band. The tank owns the colour; the key stays neutral. */}
                <span
                  style={{
                    width: 9, height: 9, borderRadius: "50%", marginTop: 4, flexShrink: 0,
                    background: ZONE_COLORS[zone.key],
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>
                      {zone.key} — {ZONE_LABELS[zone.key]}
                    </span>
                    <span style={{ fontFamily: TYPE.mono, fontSize: 10, color: t.inkMuted }}>{zone.threshold}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.ink, marginTop: 2 }}>{zone.headline}</div>
                  <div style={{ fontSize: 11, color: t.inkMuted, marginTop: 2, lineHeight: 1.35 }}>{zone.short}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 10, color: t.inkMuted, marginTop: 6, fontStyle: "italic" }}>
        Bar length = share of the working day; the readout weights by it, so a small automatable task
        counts for little. The waterline is today's AI capability — the same tide for every job; drag it up to see where it's heading.
      </div>
    </div>
  );
}

/** The inline explorer — the landing's "READ THE SCALE" instrument. */
export function ZoneExplorer() {
  // One global "today's AI capability" — the same tide across every job.
  const [waterline, setWaterline] = useState<number>(0.65);

  return (
    <div style={{ fontFamily: TYPE.body }}>
      {/* One instrument: a real job's tasks in the tank, the draggable waterline,
          and the zone descriptions aligned to the bands beside it. */}
      <WorkedExample waterline={waterline} onWaterline={setWaterline} />

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
