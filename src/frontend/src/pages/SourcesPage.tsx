/** "What's the data" — source registry (stub; full /signals endpoint is future). */

import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { THEME, TYPE } from "../lib/constants";

const t = THEME.light;

export function SourcesPage() {
  const { data } = useApi(() => api.datasets(), []);
  return (
    <div style={{ maxWidth: 780, fontFamily: TYPE.body, color: t.ink }}>
      <div style={{ fontFamily: TYPE.mono, fontSize: 12, letterSpacing: 1.5, color: t.inkMuted }}>WHAT'S THE DATA</div>
      <h1 style={{ fontFamily: TYPE.display, fontSize: 34, fontWeight: 600, margin: "6px 0 10px" }}>
        The signals powering the waterline
      </h1>
      <p style={{ color: t.inkMuted, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
        Every signal is public and openly licensed (CC BY / MIT / public domain).
        Citation-only sources are used only as references — never bundled or served.
        Licence and redistribution are tracked per source in the registry.
      </p>

      <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden", marginTop: 18 }}>
        <div style={{ display: "flex", padding: "10px 18px", background: t.ground, fontFamily: TYPE.mono, fontSize: 11.5, letterSpacing: 1, color: t.inkMuted }}>
          <div style={{ flex: 1 }}>DATASET</div>
          <div style={{ width: 110 }}>VINTAGE</div>
          <div style={{ width: 100, textAlign: "right" }}>ROWS</div>
        </div>
        {data?.datasets.map((d) => (
          <div key={d.dataset_name} style={{ display: "flex", padding: "11px 18px", borderTop: `1px solid ${t.line}`, fontSize: 14, alignItems: "center" }}>
            <div style={{ flex: 1, fontFamily: TYPE.mono, color: t.ink }}>{d.dataset_name}</div>
            <div style={{ width: 110, fontFamily: TYPE.mono, color: t.inkMuted, fontSize: 13 }}>v{d.version_key}</div>
            <div style={{ width: 100, textAlign: "right", fontFamily: TYPE.mono, color: t.inkMuted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              {d.row_count.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 14, color: t.inkMuted, fontStyle: "italic" }}>
        Per-source licence, native grain, and the redistribution gate come from the
        signal source registry (FR-9.5); a full /signals view arrives in a later phase.
      </p>
      <Link to="/" style={{ color: t.brass, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>← Back to the waterline</Link>
    </div>
  );
}
