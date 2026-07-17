/**
 * BearingsPanel — "you've read the water; here's what to do about it."
 *
 * The action layer under the Task Waterline: turns the diagnosis into
 * task-specific bearings, never zone-generic homilies. Four readings, each
 * grounded in data we actually hold:
 *
 *   · the MIX — importance-weighted share of this role's tasks dry / at the
 *     line / submerged (from the task matrix already on the page)
 *   · YOUR HIGH GROUND — the role's dry work activities (DWA-level β from
 *     /occupations/{soc}/bearings): the distinctly human skills to deepen
 *   · WHERE IT LEADS — drier occupations sharing those same dry activities,
 *     with the bridge skills named (the honest answer to the E2-heavy case).
 *     An already-dry role gets "hold the high ground" instead of weak moves.
 *   · TOOL UP FIRST — the top at-the-line tasks (E1) by importance, rising
 *     usage flagged: where being the human who wields the tools pays first
 *
 * Honesty (brand §9): bearings, not fate — the direction list is task-
 * structure arithmetic (shared dry activities × dryness gain), not career
 * advice; exposure measures what AI could reach, not what happens to jobs.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { TaskMatrixResponse, BearingsResponse } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS, ZONE_BG, ZONE_THRESHOLDS } from "../lib/constants";
import { useLanguage } from "../lib/language";
import type { Lexicon } from "../lib/lexicon";

const t = THEME.light;

export type ZoneKey = "E0" | "E1" | "E2";

export function zoneOf(beta: number): ZoneKey {
  if (beta >= ZONE_THRESHOLDS.E2) return "E2";
  if (beta >= ZONE_THRESHOLDS.E1) return "E1";
  return "E0";
}

/** Importance-weighted zone shares — "how much of the role's task weight sits
 * in each zone". Importance (1–5) is the US proxy for time; null → midpoint.
 * Exported: OccupationSummaryPanel's lead sentence reads the same mix so the
 * two panels never disagree about which pattern a role's weight calls for. */
export function zoneMix(data: TaskMatrixResponse): Record<ZoneKey, number> {
  const w: Record<ZoneKey, number> = { E0: 0, E1: 0, E2: 0 };
  let total = 0;
  for (const task of data.tasks) {
    const beta = task.eloundou_dwa_beta ?? task.automation_potential ?? 0;
    const weight = task.importance ?? 3;
    w[zoneOf(beta)] += weight;
    total += weight;
  }
  if (total > 0) (Object.keys(w) as ZoneKey[]).forEach((z) => (w[z] = w[z] / total));
  return w;
}

/** The lead sentence — which pattern this role's mix calls for. The words
 * come from the active lexicon (#79) so plain and nautical modes tell the
 * same story in their own register. */
export function leadFor(mix: Record<ZoneKey, number>, leads: Lexicon["leads"]): string {
  if (mix.E0 >= 0.5) return leads.hold;
  if (mix.E2 >= 0.35) return leads.consolidate;
  return leads.toolUp;
}

const SECTION: React.CSSProperties = {
  fontFamily: TYPE.mono,
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: t.inkMuted,
  marginBottom: 8,
};

/** `bearings` is lifted from OccupationDetailPanel (shared with
 * OccupationSummaryPanel) rather than fetched here — the two panels read the
 * same /occupations/{soc}/bearings response, so fetching it twice would be
 * a redundant round trip for identical data. */
export function BearingsPanel({ matrixData, bearings }: { matrixData: TaskMatrixResponse; bearings: BearingsResponse | null }) {
  const { mode, lex } = useLanguage();
  const mix = useMemo(() => zoneMix(matrixData), [matrixData]);

  // Top at-the-line tasks by importance; rising usage first (the current is
  // already reaching them — the tooling advantage starts there).
  const toolUp = useMemo(() => {
    return matrixData.tasks
      .map((task) => ({
        text: task.task_text,
        beta: task.eloundou_dwa_beta ?? task.automation_potential ?? 0,
        importance: task.importance ?? 3,
        rising: task.drift_classification === "departing",
      }))
      .filter((x) => zoneOf(x.beta) === "E1")
      .sort((a, b) => Number(b.rising) - Number(a.rising) || b.importance - a.importance)
      .slice(0, 3);
  }, [matrixData]);

  // A meaningful move needs real dryness to gain — an already-dry role's
  // adjacency scores collapse toward zero (verified backend behaviour).
  const moves = (bearings?.adjacent ?? []).filter((a) => a.score >= 0.08).slice(0, 4);
  const alreadyDry = mix.E0 >= 0.5 || (bearings != null && moves.length === 0);

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div style={{ background: t.surface, borderRadius: 12, border: `1.5px solid ${t.line}`, padding: 20, fontFamily: TYPE.body, color: t.ink }}>
      {/* Header + the mix */}
      <div style={{ fontFamily: TYPE.display, fontSize: 18, fontWeight: 600 }}>{lex.instruments.bearings}</div>
      <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 2, maxWidth: 560, lineHeight: 1.45 }}>{leadFor(mix, lex.leads)}</div>

      {/* The mix strip — importance-weighted zone shares on the shared axis */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, marginBottom: 18, maxWidth: 560 }}>
        <div style={{ flex: 1, display: "flex", gap: 2, height: 10 }}>
          {(["E0", "E1", "E2"] as ZoneKey[]).map((z) =>
            mix[z] > 0.005 ? (
              <div key={z} title={`${pct(mix[z])} of task weight`} style={{ width: `${mix[z] * 100}%`, background: ZONE_COLORS[z], opacity: 0.85, borderRadius: 3, minWidth: 2 }} />
            ) : null,
          )}
        </div>
        <span style={{ fontFamily: TYPE.mono, fontSize: 11, color: t.inkMuted, whiteSpace: "nowrap" }}>
          {pct(mix.E0)} {lex.mixTerms.dry} · {pct(mix.E1)} {lex.mixTerms.line} · {pct(mix.E2)} {lex.mixTerms.under}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 28px" }}>
        {/* Your high ground / durable skills — the low-exposure work to deepen */}
        <div style={{ flex: "1 1 250px", minWidth: 0 }}>
          <div style={SECTION}>{lex.instruments.highGround} — deepen these</div>
          {bearings == null ? (
            <div style={{ fontSize: 12, color: t.inkMuted, fontStyle: "italic" }}>Loading…</div>
          ) : bearings.high_ground.length === 0 ? (
            <div style={{ fontSize: 12, color: t.inkMuted, fontStyle: "italic" }}>
              {mode === "plain"
                ? "No activities in this role are clearly low-exposure — the tooling and repositioning readings matter more here."
                : "No activities in this role sit clearly dry — the tooling and repositioning readings matter more here."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bearings.high_ground.slice(0, 5).map((s) => (
                <div key={s.dwa_id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 10px", borderRadius: 7, background: ZONE_BG.E0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: ZONE_COLORS.E0, flexShrink: 0, alignSelf: "center" }} />
                  <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>{s.dwa_title}</span>
                  <span style={{ fontFamily: TYPE.mono, fontSize: 11, fontWeight: 600, color: ZONE_COLORS.E0 }}>{s.beta.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Where those skills lead — less-exposed roles sharing them */}
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div style={SECTION}>{mode === "plain" ? "Where these skills lead" : "Where the high ground leads"}</div>
          {bearings == null ? (
            <div style={{ fontSize: 12, color: t.inkMuted, fontStyle: "italic" }}>Loading…</div>
          ) : alreadyDry ? (
            <div style={{ fontSize: 12.5, color: t.inkMuted, lineHeight: 1.5 }}>
              {mode === "plain"
                ? "This role is already among the least exposed — there's nowhere meaningfully less exposed to move. The advice is to "
                : "This role already holds the high ground — there's nowhere meaningfully drier to move. The bearing is to "}
              <strong style={{ color: t.ink }}>stay and deepen</strong>, and{" "}
              <Link to="/tide" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>
                {mode === "plain" ? "watch the trends →" : "watch the tide →"}
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {moves.map((a) => (
                <Link
                  key={a.soc_code}
                  to={`/occupations?selected=${a.soc_code}`}
                  style={{ textDecoration: "none", color: t.ink, display: "block" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.brass }}>{a.title}</span>
                    <span style={{ fontFamily: TYPE.mono, fontSize: 10.5, color: t.inkMuted, whiteSpace: "nowrap" }}>
                      {lex.fmt.score(a.beta)} · {lex.fmt.drierBy(a.drier_by)}
                      {a.total_employment != null && ` · ${fmtEmp(a.total_employment)} workers`}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: t.inkMuted, lineHeight: 1.4, marginTop: 1 }}>
                    via {a.shared_titles.slice(0, 2).map((s) => s.replace(/\.$/, "")).join(" · ")}
                  </div>
                </Link>
              ))}
              <div style={{ fontSize: 10.5, color: t.inkMuted, fontStyle: "italic" }}>
                {mode === "plain"
                  ? "Ranked by shared low-exposure activities × how much lower the move's exposure is."
                  : "Ranked by shared dry activities × how much drier the move is."}
              </div>
            </div>
          )}
        </div>

        {/* Tool up first — the at-the-line tasks where the current already runs */}
        {toolUp.length > 0 && (
          <div style={{ flex: "1 1 250px", minWidth: 0 }}>
            <div style={SECTION}>Tool up first — AI assists, you lead</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {toolUp.map((task) => (
                <div key={task.text} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 10px", borderRadius: 7, background: ZONE_BG.E1 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: ZONE_COLORS.E1, flexShrink: 0, alignSelf: "center" }} />
                  <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>{task.text}</span>
                  {task.rising && (
                    <span title="AI usage of this task is rising across model eras" style={{ fontFamily: TYPE.mono, fontSize: 9.5, color: t.current, whiteSpace: "nowrap" }}>
                      rising
                    </span>
                  )}
                </div>
              ))}
              <Link to="/tide" style={{ fontSize: 11.5, color: t.brass, fontWeight: 600, textDecoration: "none" }}>
                {mode === "plain" ? "See which tasks are rising next →" : "See what the tide reaches next →"}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Honesty footer */}
      <div style={{ fontSize: 10.5, color: t.inkMuted, fontStyle: "italic", marginTop: 16 }}>
        {mode === "plain"
          ? "Guidance, not fate — exposure measures what AI could reach, not what happens to jobs. Directions are task-structure arithmetic (roles sharing this role's least-exposed activities), not career advice."
          : "Bearings, not fate — exposure measures what AI could reach, not what happens to jobs. Directions are task-structure arithmetic (roles sharing this role's dry activities), not career advice."}
      </div>
    </div>
  );
}

function fmtEmp(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
