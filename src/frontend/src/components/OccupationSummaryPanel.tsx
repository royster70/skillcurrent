/**
 * OccupationSummaryPanel — "what this means for you", above the instrument.
 *
 * External review (2026-07, tracked as GitHub #71): SkillCurrent is excellent
 * at showing exposure but slow to answer the question people actually arrive
 * with — what should I use AI for, what should I hold onto, what's coming.
 * This panel is that answer, placed above the score cards and task waterline,
 * built entirely from data the page already fetches (no new endpoint):
 *
 *   · USE AI FOR, NOW    — this role's highest-importance E1/E2 tasks
 *   · KEEP HUMAN CONTROL  — the bearings endpoint's dry high-ground DWAs
 *   · PREPARE FOR NEXT    — tasks with rising AI usage, era over era
 *   · EVIDENCE            — which independent signals actually cover this
 *     role (not a fabricated confidence score — see GitHub #73 for the real
 *     coverage/confidence work; this is an honest list of what's present)
 *
 * The lead sentence and zone mix reuse BearingsPanel's zoneMix/leadFor so the
 * two panels never disagree about which pattern a role's weight calls for.
 */

import { Link } from "react-router-dom";
import type { OccupationDetail, TaskMatrixResponse, BearingsResponse } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS, ZONE_BG } from "../lib/constants";
import { Waypoint } from "./Waypoint";
import { zoneOf, zoneMix, leadFor, type ZoneKey } from "./BearingsPanel";

const t = THEME.light;

const COLUMN_LABEL: React.CSSProperties = {
  fontFamily: TYPE.mono,
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: t.inkMuted,
  marginBottom: 8,
};

function Bullet({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 10px", borderRadius: 7, background: bg }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, alignSelf: "center" }} />
      <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>{children}</span>
    </div>
  );
}

export function OccupationSummaryPanel({
  occ,
  matrixData,
  bearings,
}: {
  occ: OccupationDetail;
  matrixData: TaskMatrixResponse;
  bearings: BearingsResponse | null;
}) {
  const mix = zoneMix(matrixData);
  const lead = leadFor(mix);

  // Use AI for, now — this role's highest-importance tasks already at or
  // below the waterline, deduped by text (a task can repeat across quadrants).
  const useAiNow = [...matrixData.tasks]
    .map((task) => ({
      text: task.task_text,
      beta: task.eloundou_dwa_beta ?? task.automation_potential ?? 0,
      importance: task.importance ?? 3,
    }))
    .filter((x) => zoneOf(x.beta) !== "E0")
    .sort((a, b) => b.importance - a.importance || b.beta - a.beta)
    .slice(0, 3);

  // Prepare for next — rising usage first (departing), backfilled with newly
  // surfacing tasks (emerging) if a role has few of the former.
  const rising = [...matrixData.tasks]
    .filter((task) => task.drift_classification === "departing")
    .sort((a, b) => (b.drift_velocity ?? 0) - (a.drift_velocity ?? 0));
  const surfacing = matrixData.tasks.filter((task) => task.drift_classification === "emerging");
  const prepareForNext = [...rising, ...surfacing].slice(0, 3);

  const highGround = bearings?.high_ground.slice(0, 3) ?? null;

  const evidence = [
    ["Eloundou", occ.eloundou_beta_gpt4],
    ["Microsoft", occ.ms_ai_applicability],
    ["AEI", occ.aei_exposure],
  ].filter(([, v]) => v != null) as [string, number][];

  return (
    <div style={{ background: t.surface, borderRadius: 12, border: `1.5px solid ${t.brass}40`, padding: 20, fontFamily: TYPE.body, color: t.ink }}>
      <Waypoint>WHAT THIS MEANS FOR YOU</Waypoint>
      <div style={{ fontFamily: TYPE.display, fontSize: 19, fontWeight: 600, lineHeight: 1.3, maxWidth: 640 }}>{lead}</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "18px 28px", marginTop: 18 }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={COLUMN_LABEL}>Use AI for, now</div>
          {useAiNow.length === 0 ? (
            <div style={{ fontSize: 12, color: t.inkMuted, fontStyle: "italic" }}>
              No task in this role currently sits at or past the waterline.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {useAiNow.map((task) => (
                <Bullet key={task.text} color={ZONE_COLORS[zoneOf(task.beta)]} bg={ZONE_BG[zoneOf(task.beta) as ZoneKey]}>
                  {task.text}
                </Bullet>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={COLUMN_LABEL}>Keep human control over</div>
          {highGround == null ? (
            <div style={{ fontSize: 12, color: t.inkMuted, fontStyle: "italic" }}>Reading the chart…</div>
          ) : highGround.length === 0 ? (
            <div style={{ fontSize: 12, color: t.inkMuted, fontStyle: "italic" }}>
              No activities in this role sit clearly dry — see Bearings below for the fuller reading.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {highGround.map((s) => (
                <Bullet key={s.dwa_id} color={ZONE_COLORS.E0} bg={ZONE_BG.E0}>
                  {s.dwa_title}
                </Bullet>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={COLUMN_LABEL}>Prepare for next</div>
          {prepareForNext.length === 0 ? (
            <div style={{ fontSize: 12, color: t.inkMuted, fontStyle: "italic" }}>
              Nothing in this role is rising notably right now.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {prepareForNext.map((task) => (
                <Bullet key={task.task_text} color={t.current} bg={`${t.current}15`}>
                  {task.task_text}
                </Bullet>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Current evidence vs future implication — the two left columns read
          today's measured exposure; the third reads a direction, not a fact. */}
      <div style={{ fontSize: 11, color: t.inkMuted, marginTop: 16, lineHeight: 1.5 }}>
        <em>Use AI for</em> and <em>keep human control over</em> reflect today's measured exposure.{" "}
        <em>Prepare for next</em> reflects rising usage across model eras — a direction, not a certainty.
      </div>

      {/* Evidence — which independent signals actually cover this role. Not a
          confidence score (that needs the concordance/bridge work in #73) —
          just an honest count of what's present. */}
      <div style={{ fontSize: 11, color: t.inkMuted, marginTop: 6 }}>
        Evidence: {evidence.length > 0 ? evidence.map(([name]) => name).join(", ") : "limited signal for this occupation"}
        {" · "}
        <Link to="/methodology" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>
          how these are combined →
        </Link>
      </div>
    </div>
  );
}
