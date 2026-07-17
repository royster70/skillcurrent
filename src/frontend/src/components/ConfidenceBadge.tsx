/**
 * ConfidenceBadge — evidence coverage on an occupation reading (GitHub #73).
 *
 * Shows how many independent signals cover this occupation and the derived
 * confidence word ("Evidence: 3 of 3 signals · High confidence"), with the
 * per-source presence list in the tooltip and the shared coverage explainer
 * one click away. US semantics only: this badge counts SIGNAL PRESENCE
 * (Eloundou / Microsoft / AEI). The AU occupation panel uses a different
 * basis (task coverage %) and must never reuse this wording — no blending
 * of confidence bases across sources (CLAUDE.md invariant).
 *
 * Renders nothing when `coverage` is absent, so the frontend tolerates
 * static payloads built before the backend field existed.
 */

import type { SignalCoverage } from "../lib/api";
import { TYPE } from "../lib/constants";
import { useLanguage } from "../lib/language";
import { ExplainDisclosure } from "./ExplainDisclosure";

const CONFIDENCE_STYLE: Record<string, { color: string; word: string }> = {
  high: { color: "#0d8f6e", word: "High confidence" },
  moderate: { color: "#9c6414", word: "Moderate confidence" },
  limited: { color: "#b23b3b", word: "Limited evidence" },
};

const SOURCE_NAMES: [keyof SignalCoverage, string][] = [
  ["eloundou", "Eloundou (predicted exposure)"],
  ["microsoft", "Microsoft (measured Copilot usage)"],
  ["aei", "Anthropic (measured Claude usage)"],
];

export function ConfidenceBadge({ coverage }: { coverage: SignalCoverage | null | undefined }) {
  const { lex } = useLanguage();
  if (!coverage) return null;

  const style = CONFIDENCE_STYLE[coverage.confidence] ?? CONFIDENCE_STYLE.limited;
  const present = SOURCE_NAMES.filter(([k]) => coverage[k]).map(([, name]) => name);
  const absent = SOURCE_NAMES.filter(([k]) => !coverage[k]).map(([, name]) => name);
  const tooltip = [
    present.length > 0 ? `Present: ${present.join(" · ")}` : "No core exposure signal covers this occupation",
    absent.length > 0 ? `Absent: ${absent.join(" · ")}` : null,
    coverage.gdpval ? "GDPval benchmark tasks exist (reported, not counted)" : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: TYPE.body }}>
      <span
        title={tooltip}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 12,
          color: style.color, backgroundColor: `${style.color}12`, border: `1px solid ${style.color}35`,
        }}
      >
        {/* signal dots — filled per present source, in source order */}
        <span aria-hidden style={{ display: "inline-flex", gap: 2.5 }}>
          {SOURCE_NAMES.map(([k]) => (
            <span
              key={k}
              style={{
                width: 5.5, height: 5.5, borderRadius: "50%",
                background: coverage[k] ? style.color : "transparent",
                border: `1px solid ${style.color}`,
              }}
            />
          ))}
        </span>
        Evidence: {coverage.signal_count} of 3 signals · {style.word}
      </span>
      <ExplainDisclosure explainer={lex.explainers.coverage} trigger="icon" />
    </span>
  );
}
