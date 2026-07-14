/**
 * ZoneExplorer — the interactive Beta/exposure-zone teaching instrument.
 *
 * Lives on the LANDING page (the "READ THE SCALE" section) — the one teaching
 * home for the platform's core concept (design 7a+7b combo). Data pages embed
 * the slim `ZoneLegend` instead, which links back here.
 *
 * The draggable Beta gauge uses BETA_SCALE/ZONE_THRESHOLDS — the same tokens
 * the app's zone-classification logic uses, so the instrument and the real
 * scale are the same numbers. Anchor points are explicitly illustrative
 * (brand honesty rule: never blur measured vs modelled).
 */

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { ZONE_COLORS, ZONE_BG, ZONE_LABELS, THEME, TYPE, BETA_SCALE, ZONE_THRESHOLDS } from "../lib/constants";

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
    examples: "Conflict mediation · hands-on patient care · high-stakes negotiation · original strategic direction",
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
    examples: "Drafting reports for review · code scaffolding · first-pass research synthesis · meeting prep",
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
    examples: "Data entry · transcription · template generation · routine scheduling · basic classification",
    sample: 1.05,
  },
] as const;

type ZoneKey = (typeof ZONE_DATA)[number]["key"];

function zoneOf(beta: number): ZoneKey {
  if (beta >= ZONE_THRESHOLDS.E2) return "E2";
  if (beta >= ZONE_THRESHOLDS.E1) return "E1";
  return "E0";
}

// A few illustrative anchor points — clearly labelled as illustrative, not a
// live-computed reading (brand brief §12: never blur measured vs modelled).
const ANCHORS = [
  { label: "e.g. Registered Nurse", beta: 0.28 },
  { label: "e.g. Software Developer", beta: 0.61 },
  { label: "e.g. Data Entry Clerk", beta: 1.15 },
];

/** An interactive Beta gauge — drag or click to "try" a value and see its zone. */
function BetaGauge({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = (v: number) => Math.max(0, Math.min(100, (v / BETA_SCALE.max) * 100));
  const e1Start = pct(ZONE_THRESHOLDS.E1);
  const e2Start = pct(ZONE_THRESHOLDS.E2);
  const medianPct = pct(BETA_SCALE.median);
  const valuePct = pct(value);
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

        {/* Illustrative anchor points */}
        {ANCHORS.map((a) => (
          <div
            key={a.label}
            title={`${a.label} (illustrative)`}
            style={{
              position: "absolute",
              left: `${pct(a.beta)}%`,
              top: 27,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: t.inkMuted,
              opacity: 0.55,
              transform: "translateX(-3px)",
            }}
          />
        ))}

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
      <div style={{ fontSize: 10.5, color: t.inkMuted, marginTop: 4, fontStyle: "italic" }}>
        Grey dots are illustrative reference points, not live-computed readings — hover for detail.
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
      {/* The gauge, on a surface card so it reads over the ground/current */}
      <div
        style={{
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 12,
          padding: "18px 20px 14px",
        }}
      >
        <BetaGauge value={betaValue} onChange={setBetaValue} />
      </div>

      {/* Three zone cards — highlight in sync with the gauge; click to jump the gauge */}
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
              <div
                style={{
                  fontSize: 10.5,
                  color: t.inkMuted,
                  marginTop: 8,
                  lineHeight: 1.5,
                  paddingTop: 8,
                  borderTop: `1px solid ${ZONE_COLORS[zone.key]}20`,
                }}
              >
                <span style={{ fontWeight: 600, color: t.ink }}>Typical tasks: </span>
                {zone.examples}
              </div>
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
