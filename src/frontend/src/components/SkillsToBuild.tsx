/**
 * SkillsToBuild — "build these skills" for a US occupation (GitHub #78).
 *
 * The review's ask: users arrive with "what should I learn?" and the product
 * answered with exposure scores. This turns the data the bearings endpoint
 * already returns into named, actionable capabilities — no new fetch, no new
 * data:
 *   · Strengthen these durable skills — the role's own low-exposure DWAs
 *     (high_ground): the distinctly-human work to deepen.
 *   · Skills that open less-exposed roles — the bridge activities shared with
 *     drier adjacent roles (adjacent[].shared_titles), attributed to where
 *     they lead.
 *
 * Provenance is stated honestly: these are O*NET work activities, not a
 * curated curriculum. Titles come from the active lexicon (#79).
 */

import type { BearingsResponse } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS, ZONE_BG } from "../lib/constants";
import { useLanguage } from "../lib/language";

const t = THEME.light;

const SECTION: React.CSSProperties = {
  fontFamily: TYPE.mono,
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: t.inkMuted,
  marginBottom: 8,
};

export function SkillsToBuild({ bearings }: { bearings: BearingsResponse | null }) {
  const { mode, lex } = useLanguage();
  if (!bearings) return null;

  const durable = bearings.high_ground.slice(0, 6);

  // Bridge skills: dedupe shared_titles across adjacent roles, remembering
  // which drier role each first appeared for (the "opens a door to" target).
  const bridges: { skill: string; role: string; drierBy: number }[] = [];
  const seen = new Set<string>();
  for (const a of bearings.adjacent.slice(0, 4)) {
    for (const raw of a.shared_titles) {
      const skill = raw.replace(/\.$/, "");
      const key = skill.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      bridges.push({ skill, role: a.title, drierBy: a.drier_by });
    }
  }

  if (durable.length === 0 && bridges.length === 0) return null;

  return (
    <div style={{ background: t.surface, borderRadius: 12, border: `1.5px solid ${t.line}`, padding: 20, fontFamily: TYPE.body, color: t.ink }}>
      <div style={{ fontFamily: TYPE.display, fontSize: 18, fontWeight: 600 }}>
        {mode === "plain" ? "Build these skills" : lex.instruments.highGround}
      </div>
      <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 2, maxWidth: 560, lineHeight: 1.45 }}>
        {mode === "plain"
          ? "Named capabilities to deepen — the work in this role that stays human-led, and the skills that bridge to less-exposed roles."
          : "The high ground to hold — this role's dry activities to deepen, and the bridge skills that lead to drier roles."}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 28px", marginTop: 16 }}>
        {durable.length > 0 && (
          <div style={{ flex: "1 1 250px", minWidth: 0 }}>
            <div style={SECTION}>
              {mode === "plain" ? "Strengthen these durable skills" : "Deepen your high ground"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {durable.map((s) => (
                <span
                  key={s.dwa_id}
                  title={lex.fmt.score(s.beta)}
                  style={{
                    fontSize: 12, lineHeight: 1.35, padding: "5px 10px", borderRadius: 7,
                    background: ZONE_BG.E0, border: `1px solid ${ZONE_COLORS.E0}30`,
                  }}
                >
                  {s.dwa_title}
                </span>
              ))}
            </div>
          </div>
        )}

        {bridges.length > 0 && (
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <div style={SECTION}>
              {mode === "plain" ? "Skills that open less-exposed roles" : "Bridge skills to drier roles"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bridges.slice(0, 6).map((b) => (
                <div key={b.skill} style={{ fontSize: 12, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 500 }}>{b.skill}</span>
                  <span style={{ color: t.inkMuted }}>
                    {" — opens "}
                    <span style={{ color: t.brass, fontWeight: 600 }}>{b.role}</span>
                    {` (${lex.fmt.drierBy(b.drierBy)})`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 10.5, color: t.inkMuted, fontStyle: "italic", marginTop: 14 }}>
        Derived from O*NET work activities for this role — capabilities to build, not a curriculum.
      </div>
    </div>
  );
}
