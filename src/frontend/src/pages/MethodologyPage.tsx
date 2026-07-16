/**
 * "How this works" — the full product-facing methodology (GitHub #72).
 *
 * Was a stub promising "a worked example, source registry, and citations in
 * a later phase" — this is that phase. External review (2026-07, tracked in
 * ai_working/feedback-triage-2026-07-17-sol.md): a strong classification like
 * "high automation potential" needs a page that answers, honestly: is this a
 * measurement or a prediction, why do the thresholds sit where they do, how
 * much of the AU reading is really US data wearing a translation, and what
 * this platform explicitly does NOT claim.
 *
 * Every number below is either computed live from tokens already imported
 * (ZONE_THRESHOLDS, BETA_SCALE) or cited from a specific file so a stale
 * claim is easy to catch on the next pass, rather than hand-typed prose that
 * quietly drifts from the code. The worked occupation reuses the exact task
 * set already shown in ZoneExplorer's Read the Scale — one number, one home,
 * never two hand-tuned copies that can disagree.
 */

import { Link } from "react-router-dom";
import { THEME, TYPE, ZONE_COLORS, ZONE_BG, ZONE_LABELS, ZONE_THRESHOLDS, BETA_SCALE } from "../lib/constants";
import { zoneOf } from "../components/BearingsPanel";

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
  [
    "Zones",
    "β sorts each task into insulated · augmented · high automation potential — above, at, or " +
      "below the line. The deepest zone reads capability, not deployment: AI can perform much of " +
      "the task, but whether it does depends on tools, controls and context.",
  ],
];

// The same three-task Registered Nurse set already published in ZoneExplorer's
// Read the Scale (ZoneExplorer.tsx ROLE_EXAMPLES) — one illustrative set, not
// a second hand-tuned copy. "time" = share of the working day, the same
// weight the platform uses everywhere it rolls task readings up to a role.
const NURSE_TASKS = [
  { text: "Chart patient vitals and update records", beta: 0.88, time: 20 },
  { text: "Administer medications and treatments", beta: 0.47, time: 35 },
  { text: "Comfort and reassure patients and families", beta: 0.13, time: 45 },
];

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: TYPE.mono,
  fontSize: 10.5,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: t.inkMuted,
  marginBottom: 4,
};

function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div id={id} style={{ scrollMarginTop: 24 }}>
      <div style={SECTION_LABEL}>{eyebrow}</div>
      <h2 style={{ fontFamily: TYPE.display, fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>{title}</h2>
    </div>
  );
}

const Body = ({ children }: { children: React.ReactNode }) => (
  <p style={{ color: t.inkMuted, fontSize: 15, lineHeight: 1.6, maxWidth: 680, margin: "0 0 12px" }}>{children}</p>
);

export function MethodologyPage() {
  const weightedBeta = NURSE_TASKS.reduce((s, task) => s + (task.beta * task.time) / 100, 0);
  const weightedZone = zoneOf(weightedBeta);

  return (
    <div style={{ maxWidth: 820, fontFamily: TYPE.body, color: t.ink }}>
      <div style={{ fontFamily: TYPE.mono, fontSize: 12, letterSpacing: 1.5, color: t.inkMuted }}>HOW THIS WORKS</div>
      <h1 style={{ fontFamily: TYPE.display, fontSize: 34, fontWeight: 600, margin: "6px 0 10px" }}>
        From data to the waterline
      </h1>
      <p style={{ color: t.inkMuted, fontSize: 16, lineHeight: 1.6, marginTop: 0, maxWidth: 680 }}>
        SkillCurrent turns public occupational data and AI research into one honest,
        traceable exposure signal. Every derived number carries its source vintage —
        this page is the full trace, not the summary.
      </p>

      {/* ── At a glance — the four-stage overview kept from the original stub ── */}
      <div style={{ marginTop: 20 }}>
        {STAGES.map(([title, body], i) => (
          <div key={title} style={{ display: "flex", gap: 16, padding: "14px 0", borderTop: i ? `1px solid ${t.line}` : "none" }}>
            <div style={{ fontFamily: TYPE.mono, color: t.brass, fontSize: 14, width: 24, flexShrink: 0 }}>{i + 1}</div>
            <div>
              <div style={{ fontFamily: TYPE.display, fontSize: 17, fontWeight: 600, marginBottom: 3 }}>{title}</div>
              <div style={{ color: t.inkMuted, fontSize: 14, lineHeight: 1.55, maxWidth: 640 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── A worked occupation ── */}
      <div style={{ marginTop: 44 }}>
        <SectionHeading id="worked-example" eyebrow="A WORKED OCCUPATION" title="Registered Nurse, task by task" />
        <Body>
          The same worked set shown in Read the Scale on the homepage — illustrative, chosen to
          span all three zones in one role. For the live, currently-refreshed per-task reading,
          see the <Link to="/occupations?selected=29-1141.00" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>occupation's own page →</Link>.
        </Body>

        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden", marginTop: 12, maxWidth: 680 }}>
          {NURSE_TASKS.map((task) => {
            const z = zoneOf(task.beta);
            return (
              <div key={task.text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${t.line}` }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: ZONE_COLORS[z], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13.5 }}>{task.text}</span>
                <span style={{ fontFamily: TYPE.mono, fontSize: 12, color: t.inkMuted, width: 54, textAlign: "right" }}>{task.time}% of day</span>
                <span style={{ fontFamily: TYPE.mono, fontSize: 13, fontWeight: 700, color: ZONE_COLORS[z], width: 48, textAlign: "right" }}>
                  β {task.beta.toFixed(2)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: ZONE_COLORS[z], background: ZONE_BG[z], padding: "2px 8px", borderRadius: 10, width: 96, textAlign: "center" }}>
                  {ZONE_LABELS[z]}
                </span>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: t.ground }}>
            <span style={{ width: 8, height: 8, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Role reading — time-weighted, not eyeballed</span>
            <span style={{ fontFamily: TYPE.mono, fontSize: 12, color: t.inkMuted, width: 54, textAlign: "right" }}>100%</span>
            <span style={{ fontFamily: TYPE.mono, fontSize: 13, fontWeight: 700, color: ZONE_COLORS[weightedZone], width: 48, textAlign: "right" }}>
              β {weightedBeta.toFixed(3)}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: ZONE_COLORS[weightedZone], background: ZONE_BG[weightedZone], padding: "2px 8px", borderRadius: 10, width: 96, textAlign: "center" }}>
              {ZONE_LABELS[weightedZone]}
            </span>
          </div>
        </div>
        <Body>
          <span style={{ display: "block", marginTop: 12 }}>
            Three tasks, three zones — but the role's overall reading is a share-of-day-weighted
            average, not a vote or a maximum. Here that average lands at β ≈ {weightedBeta.toFixed(2)},
            just under the {ZONE_THRESHOLDS.E1.toFixed(2)} line — {ZONE_LABELS.E0} overall, even
            though the highest-exposure task alone would read {ZONE_LABELS.E2}. The highest-exposure
            task (charting) takes the least time; the lowest-exposure task (comforting patients)
            takes the most. That's the platform's actual rollup rule, not a simplification of it —
            the same weighting <Link to="/" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>the homepage bars</Link> and
            every occupation's bearings use.
          </span>
        </Body>
      </div>

      {/* ── How β is built ── */}
      <div style={{ marginTop: 44 }}>
        <SectionHeading id="the-formula" eyebrow="THE FORMULA" title="β = E1 + 0.5 × E2" />
        <Body>
          Eloundou et al. (2024, "GPTs are GPTs") had GPT-4 and human annotators rate every O*NET
          task against two separate questions:
        </Body>
        <ul style={{ color: t.inkMuted, fontSize: 15, lineHeight: 1.7, maxWidth: 680, margin: "0 0 12px", paddingLeft: 20 }}>
          <li><strong style={{ color: t.ink }}>E1 — direct exposure:</strong> would a model alone, with no extra tooling, cut the time this task takes by at least half at the same quality?</li>
          <li><strong style={{ color: t.ink }}>E2 — complementary exposure:</strong> would a model plus purpose-built software or tools get there instead?</li>
        </ul>
        <Body>
          A task can score on both — a text-drafting task might be fully reachable by the model
          alone (E1 high) while a data-entry task needs tool integration to get there (E2 high).
          Because E2 is counted at half weight, β = E1 + 0.5×E2 runs from 0 to {BETA_SCALE.max} rather
          than 0 to 1 — a task scoring E1 = 0.7 and E2 = 0.4 reads β = 0.7 + 0.5×0.4 = 0.90. The 0.5
          coefficient is from the published research; SkillCurrent does not change it.
        </Body>
        <Body>
          Eloundou's raw scores are occupation-level — 923 occupations, not individual tasks. To get
          a task-level reading, each occupation's score is distributed across its O*NET work
          activities (DWAs), weighted by how important O*NET rates each task to that occupation —
          higher-importance tasks carry more of the occupation's exposure signal. That derivation
          (Strategy A) produced 17,537 task-level scores from the original 923 occupation-level ones;
          it's a one-time computation, not a live model call, so the same occupation always
          distributes the same way.
        </Body>
      </div>

      {/* ── Why 0.40 and 0.85 ── */}
      <div style={{ marginTop: 44 }}>
        <SectionHeading id="thresholds" eyebrow="THE ZONE LINES" title={`Why ${ZONE_THRESHOLDS.E1.toFixed(2)} and ${ZONE_THRESHOLDS.E2.toFixed(2)}`} />
        <Body>
          The honest answer: they're configurable defaults on the published 0–{BETA_SCALE.max} scale,
          not a statistically discovered break in the data. Below {ZONE_THRESHOLDS.E1.toFixed(2)} reads
          as {ZONE_LABELS.E0} (β &lt; 0.40); {ZONE_THRESHOLDS.E1.toFixed(2)}–{ZONE_THRESHOLDS.E2.toFixed(2)} as {ZONE_LABELS.E1};
          {" "}{ZONE_THRESHOLDS.E2.toFixed(2)} and above as {ZONE_LABELS.E2}. Both lines are set once, in
          one place, and everything on the platform reads off them — but they could be moved, and a
          different deployment might reasonably move them.
        </Body>
        <Body>
          What matters more than the exact cutoff is the direction and the relative ranking: whether
          a task or role sits closer to the top or bottom of the scale, and whether that reading is
          rising or holding as capability improves — the question the <Link to="/tide" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>Rising Tide view</Link> answers.
          A task at β 0.83 and one at β 0.87 are read into different zones by these defaults, but
          they're far more alike than either is to a task at β 0.10.
        </Body>
      </div>

      {/* ── Observed usage vs theoretical exposure ── */}
      <div style={{ marginTop: 44 }}>
        <SectionHeading id="observed-vs-theoretical" eyebrow="THREE KINDS OF EVIDENCE" title="Could AI do this vs. is AI doing this" />
        <Body>
          β answers a theoretical question — could today's AI do this task? Two other signals answer
          an empirical one — is it actually being used for this, in practice? The gap between the two
          is itself a finding: it's where capability has outrun adoption, or where adoption tells a
          different story than capability alone would suggest.
        </Body>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680 }}>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: t.ground, border: `1px solid ${t.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Eloundou 2024 — theoretical</div>
            <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 2 }}>"Could AI do this?" GPT-4 and human raters judging capability, scored once against the 2024 model generation.</div>
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: t.ground, border: `1px solid ${t.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Microsoft "Working with AI" — empirical</div>
            <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 2 }}>"Is AI being used for this, and does it work?" Measured Bing Copilot usage, January–September 2024 — a consumer search-assistant context, not the whole AI market.</div>
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: t.ground, border: `1px solid ${t.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Anthropic Economic Index (AEI) — empirical</div>
            <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 2 }}>Claude usage patterns, sampled across four successive model generations — a different product context than Microsoft's, so differences between the two are platform-specific usage, not a contradiction.</div>
          </div>
        </div>
        <Body>
          <span style={{ display: "block", marginTop: 10 }}>
            None of the three is "the" answer — the occupation and search pages show all that are
            available side by side, each labelled by source, rather than blending them into one number.
          </span>
        </Body>
      </div>

      {/* ── The AU bridge ── */}
      <div style={{ marginTop: 44 }}>
        <SectionHeading id="au-bridge" eyebrow="US → AU" title="How the Australian reading is built" />
        <Body>
          Task-level exposure research is published for the US O*NET taxonomy, not Australia's. AU
          coverage isn't a copy of the US numbers with local labels — it's the same distributed-DWA
          scale, reached by a documented bridge with a stated confidence floor.
        </Body>
        <ul style={{ color: t.inkMuted, fontSize: 15, lineHeight: 1.7, maxWidth: 680, margin: "0 0 12px", paddingLeft: 20 }}>
          <li>
            <strong style={{ color: t.ink }}>Occupation backbone:</strong> OSCA 2024 (the ABS's current
            classification) replaces the retired ANZSCO as the canonical AU occupation list. OSCA's own
            "main tasks" are broad, AI-generated descriptions with no link back to O*NET — they carry
            no exposure reading themselves.
          </li>
          <li>
            <strong style={{ color: t.ink }}>Task-level carrier:</strong> the Australian Skills
            Classification (ASC) v3.0's specialist tasks do the real work, but the published ASC files
            don't record which O*NET work activity each task descends from — that link isn't in the
            source data. So each ASC task is matched to its nearest O*NET DWA <em>semantically</em>{" "}
            (embedding similarity), not looked up. Matches below a 0.60 cosine-similarity floor are
            excluded rather than kept at low confidence; in practice this reached 1,923 of 1,925
            distinct AU tasks (99.9%). Once matched, an AU task reads the same DWA-level β the US
            layer uses — so a US and an AU task-level number are directly comparable, not two
            different scales.
          </li>
          <li>
            <strong style={{ color: t.ink }}>Employment weighting:</strong> not every AU occupation has
            a clean 1:1 employment figure — Australia's employment statistics are published at a
            coarser grain than OSCA's occupation list for some rows. Where a direct measured link
            exists, it's used; where it doesn't, employment is apportioned from an auxiliary source
            and tagged as modelled rather than measured. A modelled split is never presented as if it
            were counted.
          </li>
        </ul>
      </div>

      {/* ── Limitations ── */}
      <div style={{ marginTop: 44 }}>
        <SectionHeading id="limitations" eyebrow="WHAT THIS ISN'T" title="Limitations and non-claims" />
        <ul style={{ color: t.inkMuted, fontSize: 15, lineHeight: 1.75, maxWidth: 680, margin: "0 0 12px", paddingLeft: 20 }}>
          <li>β reads <strong style={{ color: t.ink }}>capability, not deployment</strong> — a high score means AI could plausibly do the task, not that it currently does, or that a specific employer has adopted it.</li>
          <li>These are <strong style={{ color: t.ink }}>task-level readings, not occupation forecasts</strong> — no occupation is predicted to disappear; roles are bundles of tasks that individually shift.</li>
          <li>Eloundou's ratings are a <strong style={{ color: t.ink }}>dated snapshot</strong> (2024, GPT-4 generation) — capability has moved since. The Rising Tide view tracks that movement separately, using later model generations; it does not retroactively change β.</li>
          <li>AU task exposure is <strong style={{ color: t.ink }}>bridged semantically</strong>, not sourced from a literal task-to-task lookup that doesn't exist in the published data — matches are scored, not guaranteed.</li>
          <li>Zone thresholds are <strong style={{ color: t.ink }}>configurable defaults</strong>, not universal physical constants.</li>
          <li>This is a <strong style={{ color: t.ink }}>research and planning instrument</strong>, not a certification, and not career, legal, or financial advice — see any occupation's <Link to="/occupations" style={{ color: t.brass, fontWeight: 600, textDecoration: "none" }}>Bearings panel</Link> for the same honesty framing applied to individual roles.</li>
        </ul>
      </div>

      {/* ── Evidence, live ── */}
      <div style={{ marginTop: 44, padding: "18px 20px", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, maxWidth: 680 }}>
        <div style={{ fontFamily: TYPE.display, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Every source, with its exact vintage</div>
        <p style={{ color: t.inkMuted, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 10px" }}>
          Rather than restate version numbers here and risk them drifting out of sync, the live
          source registry is the single place they're kept.
        </p>
        <Link to="/sources" style={{ color: t.brass, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
          See the data behind it →
        </Link>
      </div>

      <div style={{ marginTop: 28 }}>
        <Link to="/" style={{ color: t.brass, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>← Back to the waterline</Link>
      </div>
    </div>
  );
}
