/**
 * AuOccupationPanel — the AU-native occupation reading (GitHub #73/#78).
 *
 * The first UI surface for the OSCA/ASC layer. Distinct from the US
 * occupation detail in both data and framing:
 *   · exposure basis is TASK COVERAGE (% of ASC tasks with a measured bridge
 *     reading) — a different confidence basis from the US 3-signal count, so
 *     it gets its own visual treatment and label; the two must never read as
 *     the same metric (no cross-source blending, CLAUDE.md).
 *   · "build these skills" here is REAL named competencies (ASC core
 *     competencies with proficiency), not the US DWA proxy.
 *   · OSCA main tasks are shown with an explicit "descriptor only" note.
 *
 * Loaded from GET /au/occupations/{osca}; renders nothing until data arrives.
 */

import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
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

/** Coverage band — AU-specific. Deliberately NOT the US signal-dot badge:
 * a coverage percentage and a signal-presence count are different bases. */
function coverageBand(pct: number | null): { color: string; word: string } {
  if (pct == null) return { color: t.inkMuted, word: "no measured tasks" };
  if (pct >= 80) return { color: "#0d8f6e", word: "high task coverage" };
  if (pct >= 40) return { color: "#9c6414", word: "partial task coverage" };
  return { color: "#b23b3b", word: "limited task coverage" };
}

export function AuOccupationPanel({ oscaCode, onClose }: { oscaCode: string; onClose?: () => void }) {
  const { lex } = useLanguage();
  const { data, loading } = useApi(() => api.auOccupation(oscaCode), [oscaCode]);

  if (loading) return <div style={{ fontSize: 13, color: t.inkMuted }}>Loading Australian reading…</div>;
  if (!data) return null;

  const exp = data.exposure;
  const band = coverageBand(exp?.coverage_pct ?? null);
  const socs = [...new Set(data.anzsco_lineage.flatMap((l) => l.soc_codes))];

  return (
    <div style={{ background: t.surface, borderRadius: 12, border: `1.5px solid ${t.brass}40`, padding: 20, fontFamily: TYPE.body, color: t.ink }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11.5, color: t.inkMuted, marginBottom: 3 }}>
            🇦🇺 Australian occupation · OSCA {data.osca_code} · v{data.osca_version}
          </div>
          <h2 style={{ fontFamily: TYPE.display, fontSize: 22, fontWeight: 600, margin: 0 }}>{data.title}</h2>
          {data.total_employment != null && (
            <div style={{ fontSize: 12, color: t.inkMuted, marginTop: 2 }}>
              {(data.total_employment / 1000).toFixed(0)}K AU workers
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close Australian reading"
            style={{ background: "none", border: `1px solid ${t.line}`, borderRadius: 6, cursor: "pointer", color: t.inkMuted, padding: "4px 10px", fontSize: 12 }}
          >
            Close
          </button>
        )}
      </div>

      {/* Exposure + coverage — AU basis, visually distinct from the US badge */}
      {exp && (
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: ZONE_BG.E1, border: `1px solid ${ZONE_COLORS.E1}22` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            {exp.au_task_beta != null && (
              <span style={{ fontFamily: TYPE.mono, fontSize: 20, fontWeight: 700, color: ZONE_COLORS.E1 }}>
                {lex.fmt.score(exp.au_task_beta)}
              </span>
            )}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: band.color }}>{band.word}</span>
            <span style={{ fontSize: 11.5, color: t.inkMuted }}>
              {exp.coverage_pct != null ? `${exp.coverage_pct}% of ` : ""}
              {exp.task_count} ASC tasks measured
              {exp.divergent_task_count > 0 ? ` · ${exp.divergent_task_count} diverge from the US reading` : ""}
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: t.inkMuted, fontStyle: "italic", marginTop: 6 }}>
            {exp.confidence_basis}.{" "}
            <a href="/methodology#au-bridge" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>
              How the AU reading is built →
            </a>
          </div>
        </div>
      )}

      {/* ASC core competencies — the AU "build these skills" (real named skills) */}
      {data.competencies.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={SECTION}>Build these skills — core competencies</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.competencies.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 10px", borderRadius: 7, background: ZONE_BG.E0 }}>
                <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.35 }}>{c.name}</span>
                {c.proficiency_level && (
                  <span style={{ fontSize: 10.5, color: t.inkMuted }}>{c.proficiency_level}</span>
                )}
                {c.score != null && (
                  <span style={{ fontFamily: TYPE.mono, fontSize: 11, fontWeight: 600, color: ZONE_COLORS.E0 }}>
                    {c.score.toFixed(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: t.inkMuted, fontStyle: "italic", marginTop: 8 }}>
            Australian Skills Classification v3.0 (JSA)
            {data.competency_source_anzsco ? ` · ANZSCO ${data.competency_source_anzsco}` : ""}.
          </div>
        </div>
      )}

      {/* OSCA main tasks — descriptor-only, explicitly not scored */}
      {data.main_tasks.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={SECTION}>Main tasks</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: t.ink }}>
            {data.main_tasks.slice(0, 8).map((task, i) => (
              <li key={i}>{task}</li>
            ))}
          </ul>
          <div style={{ fontSize: 10.5, color: t.inkMuted, fontStyle: "italic", marginTop: 6 }}>
            OSCA main tasks are broad descriptors — used for context, never for scoring.
          </div>
        </div>
      )}

      {/* ANZSCO / US SOC lineage footnote */}
      {(data.anzsco_lineage.length > 0 || socs.length > 0) && (
        <div style={{ fontSize: 10.5, color: t.inkMuted, marginTop: 16, lineHeight: 1.5 }}>
          Lineage: ANZSCO {data.anzsco_lineage.map((l) => l.anzsco_code).join(", ")}
          {socs.length > 0 ? ` · related US SOC ${socs.slice(0, 4).join(", ")}` : ""}.
        </div>
      )}
    </div>
  );
}
