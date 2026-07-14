/**
 * Zone Explainer Panel — collapsible education panel explaining E0/E1/E2
 * exposure zones in plain language.
 *
 * Based on slide 4 of "Work Taxonomy and AI Skilling" primer presentation.
 * Collapsed by default — repeat users skip it, first-timers expand to learn.
 *
 * Self-contained: manages own expanded/collapsed state internally.
 */

import { useState } from "react";
import { ZONE_COLORS, ZONE_BG, ZONE_LABELS, THEME, TYPE } from "../lib/constants";
import { IconInfo, IconChevron } from "./current/icons";

const t = THEME.light;

interface ZoneExplainerPanelProps {
  defaultExpanded?: boolean;
}

const ZONE_DATA = [
  {
    key: "E0" as const,
    threshold: "Beta < 0.40",
    headline: "Human-only work",
    description:
      "Tasks unlikely to be impacted by AI in the near term. Human-only work with supporting systems and processes.",
    implication: "Focus: preserve and invest in these distinctly human capabilities.",
  },
  {
    key: "E1" as const,
    threshold: "Beta 0.40–0.85",
    headline: "AI assists, human leads",
    description:
      "Co-pilot workflows where AI handles routine subtasks while humans provide judgment, creativity, and oversight.",
    implication: "Focus: upskill workers to collaborate effectively with AI tools.",
  },
  {
    key: "E2" as const,
    threshold: "Beta ≥ 0.85",
    headline: "AI performs, human validates",
    description:
      "Tasks that can be substantially automated or delegated to AI agents. Humans shift to quality assurance and exception handling.",
    implication: "Focus: redesign roles around oversight, exceptions, and new value creation.",
  },
] as const;

export function ZoneExplainerPanel({ defaultExpanded = false }: ZoneExplainerPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1.5px solid ${t.line}`,
        overflow: "hidden",
        transition: "all 0.3s ease",
        fontFamily: TYPE.body,
      }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded((e) => !e)}
        role="button"
        aria-expanded={expanded}
        aria-label="Understanding Exposure Zones"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          backgroundColor: t.ground,
          borderBottom: expanded ? `1px solid ${t.line}` : "none",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <IconInfo size={16} color={t.inkMuted} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: t.ink,
            }}
          >
            Understanding Exposure Zones
          </span>
          {/* Three zone colour pips */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 4 }}>
            {(["E0", "E1", "E2"] as const).map((zone) => (
              <div
                key={zone}
                title={`${zone} — ${ZONE_LABELS[zone]}`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: ZONE_COLORS[zone],
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: 13,
              color: t.inkMuted,
            }}
          >
            What do E0, E1, E2 mean?
          </span>
          <IconChevron
            size={16}
            color={t.inkMuted}
            style={{
              transition: "transform 0.3s ease",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </div>

      {/* Expandable body */}
      <div
        style={{
          maxHeight: expanded ? 400 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div style={{ padding: "20px 20px 16px" }}>
          {/* Three zone cards */}
          <div style={{ display: "flex", gap: 16 }}>
            {ZONE_DATA.map((zone) => (
              <div
                key={zone.key}
                style={{
                  flex: 1,
                  borderRadius: 8,
                  borderLeft: `4px solid ${ZONE_COLORS[zone.key]}`,
                  backgroundColor: ZONE_BG[zone.key],
                  padding: "16px 16px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: ZONE_COLORS[zone.key],
                    }}
                  >
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
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: t.ink,
                    marginBottom: 6,
                  }}
                >
                  {zone.headline}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: t.inkMuted,
                    lineHeight: 1.5,
                  }}
                >
                  {zone.description}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: t.inkMuted,
                    fontStyle: "italic",
                    marginTop: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {zone.implication}
                </div>
              </div>
            ))}
          </div>

          {/* Footer line */}
          <div
            style={{
              fontSize: 11,
              color: t.inkMuted,
              fontStyle: "italic",
              textAlign: "center",
              marginTop: 14,
            }}
          >
            Beta = E1 + 0.5×E2 (Eloundou 2024). No occupation has all tasks
            affected — most roles blend all three zones.
          </div>
        </div>
      </div>
    </div>
  );
}
