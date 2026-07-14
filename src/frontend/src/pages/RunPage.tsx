/** "Run this yourself" — the self-hoster path (design 8c; stub until the
 * public repo ships, at which point the tier links go live). */

import { Link } from "react-router-dom";
import { THEME, TYPE } from "../lib/constants";

const t = THEME.light;

const TIERS: { n: string; title: string; body: string }[] = [
  {
    n: "①",
    title: "Fork the static mirror",
    body: "The CDN build doubles as the fork path — every occupation, sector, and score pre-rendered as static data. Clone, deploy anywhere, no database needed.",
  },
  {
    n: "②",
    title: "Run the full stack",
    body: "docker compose up brings up PostgreSQL + the API + this frontend with the complete pipeline — semantic search, company classification, and all 600k+ rows.",
  },
  {
    n: "③",
    title: "Add a signal",
    body: "The signal source registry is extensible by design: one row per source with its licence and redistribution status. New exposure research drops in as a registered signal, not a fork of the pipeline.",
  },
];

export function RunPage() {
  return (
    <div style={{ maxWidth: 760, fontFamily: TYPE.body, color: t.ink }}>
      <div style={{ fontFamily: TYPE.mono, fontSize: 12, letterSpacing: 1.5, color: t.brass }}>RUN THIS YOURSELF</div>
      <h1 style={{ fontFamily: TYPE.display, fontSize: 34, fontWeight: 600, margin: "6px 0 10px" }}>
        Open by design
      </h1>
      <p style={{ color: t.inkMuted, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
        SkillCurrent is open source — MIT code, CC BY 4.0 data compilation. Three
        ways in, from lightest to deepest:
      </p>

      <div style={{ marginTop: 20 }}>
        {TIERS.map((tier, i) => (
          <div key={tier.title} style={{ display: "flex", gap: 16, padding: "16px 0", borderTop: i ? `1px solid ${t.line}` : "none" }}>
            <div style={{ fontFamily: TYPE.mono, color: t.brass, fontSize: 18, width: 28, flexShrink: 0 }}>{tier.n}</div>
            <div>
              <div style={{ fontFamily: TYPE.display, fontSize: 19, fontWeight: 600, marginBottom: 4 }}>{tier.title}</div>
              <div style={{ color: t.inkMuted, fontSize: 15, lineHeight: 1.55 }}>{tier.body}</div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 14, color: t.inkMuted, fontStyle: "italic" }}>
        Repository links land here when the public repo ships. Meanwhile: see{" "}
        <Link to="/methodology" style={{ color: t.brass }}>how this works</Link> and{" "}
        <Link to="/sources" style={{ color: t.brass }}>the data powering it</Link>.
      </p>
      <Link to="/" style={{ color: t.brass, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>← Back to the waterline</Link>
    </div>
  );
}
