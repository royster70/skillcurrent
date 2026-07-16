/** "How this works" — methodology (stub; full build is redesign phase 6). */

import { Link } from "react-router-dom";
import { THEME, TYPE } from "../lib/constants";

const t = THEME.light;

const STAGES = [
  ["Sources", "O*NET occupations & tasks, employment (BLS/ABS), plus AI research & observed usage."],
  ["Crosswalk", "Tasks map to standard work activities (DWAs), bridging US and AU classifications."],
  [
    "β / exposure",
    "β = E1 + 0.5·E2 — direct AI exposure (E1) plus half-weighted tool-assisted exposure (E2). " +
      "A task can carry both, so β runs 0–1.5 rather than 0–1. From the Eloundou et al. 2024 " +
      "task-exposure study (\"GPTs are GPTs\").",
  ],
  ["Zones", "β sorts each task into insulated · augmented · automated — above, at, or below the line."],
];

export function MethodologyPage() {
  return (
    <div style={{ maxWidth: 760, fontFamily: TYPE.body, color: t.ink }}>
      <div style={{ fontFamily: TYPE.mono, fontSize: 12, letterSpacing: 1.5, color: t.inkMuted }}>HOW THIS WORKS</div>
      <h1 style={{ fontFamily: TYPE.display, fontSize: 34, fontWeight: 600, margin: "6px 0 10px" }}>
        From data to the waterline
      </h1>
      <p style={{ color: t.inkMuted, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
        SkillCurrent turns public occupational data and AI research into one honest,
        traceable exposure signal. Every derived number carries its source vintage.
      </p>

      <div style={{ marginTop: 20 }}>
        {STAGES.map(([title, body], i) => (
          <div key={title} style={{ display: "flex", gap: 16, padding: "16px 0", borderTop: i ? `1px solid ${t.line}` : "none" }}>
            <div style={{ fontFamily: TYPE.mono, color: t.brass, fontSize: 14, width: 24, flexShrink: 0 }}>{i + 1}</div>
            <div>
              <div style={{ fontFamily: TYPE.display, fontSize: 19, fontWeight: 600, marginBottom: 4 }}>{title}</div>
              <div style={{ color: t.inkMuted, fontSize: 15, lineHeight: 1.55 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 14, color: t.inkMuted, fontStyle: "italic" }}>
        Fuller methodology (worked example, source registry, cite-this-page) arrives
        in a later phase.
      </p>
      <Link to="/" style={{ color: t.brass, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>← Back to the waterline</Link>
    </div>
  );
}
