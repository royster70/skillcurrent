/**
 * ReadingPrimer — the on-ramp to the β scale for someone brand new.
 *
 * Three beats, concrete → abstract, each with a small supporting visual:
 *   ① a job is a bundle of tasks (AI reaches tasks, not jobs)
 *   ② two questions make the reading (the honest 0–1.5 derivation:
 *      β = E1 + 0.5·E2 told in plain words — a task can score on BOTH
 *      questions, which is why the scale runs past 1)
 *   ③ the reading is a depth (hands off into the interactive tank below)
 *
 * Sits above ZoneExplorer in the landing's READ THE SCALE section. Borderless
 * (the de-boxed house style); zone hues appear only positionally (dots inside
 * their bands), never decoratively. Ends with the provenance line — where the
 * number actually comes from — linking to the methodology.
 */

import { Link } from "react-router-dom";
import { THEME, TYPE, ZONE_COLORS, ZONE_BG, BETA_SCALE, ZONE_THRESHOLDS } from "../lib/constants";
import { useLanguage } from "../lib/language";

const t = THEME.light;

// ── Step visuals — small inline SVGs, ~190×84 viewBox each ──

/** ① One job fanning out into tasks at different heights on the banded scale. */
function VisJobToTasks({ top, bottom }: { top: string; bottom: string }) {
  // Band spans on an 84px-tall column (β 0–1.5, thresholds 0.40 / 0.85).
  const H = 84;
  const y40 = (ZONE_THRESHOLDS.E1 / BETA_SCALE.max) * H;
  const y85 = (ZONE_THRESHOLDS.E2 / BETA_SCALE.max) * H;
  // Task dots: β heights spanning the scale (dry → deep).
  const dots = [
    { beta: 0.16, zone: "E0" as const },
    { beta: 0.52, zone: "E1" as const },
    { beta: 0.74, zone: "E1" as const },
    { beta: 1.05, zone: "E2" as const },
  ];
  const yOf = (b: number) => (b / BETA_SCALE.max) * H;
  return (
    <svg viewBox="0 0 190 84" width="100%" style={{ display: "block", maxWidth: 210 }} aria-hidden="true">
      {/* the job */}
      <rect x={4} y={27} width={62} height={30} rx={7} fill={t.surface} stroke={t.line} strokeWidth={1.5} />
      <text x={35} y={45} textAnchor="middle" fontSize={9.5} fontFamily={TYPE.mono} fill={t.ink}>a job</text>
      {/* banded mini scale */}
      <rect x={150} y={0} width={16} height={y40} fill={ZONE_BG.E0} />
      <rect x={150} y={y40} width={16} height={y85 - y40} fill={ZONE_BG.E1} />
      <rect x={150} y={y85} width={16} height={H - y85} fill={ZONE_BG.E2} />
      <rect x={150} y={0} width={16} height={H} fill="none" stroke={t.line} strokeWidth={1} rx={2} />
      {/* fan lines + task dots at their β heights */}
      {dots.map((d, i) => (
        <g key={i}>
          <line x1={66} y1={42} x2={154} y2={yOf(d.beta)} stroke={t.line} strokeWidth={1} />
          <circle cx={158} cy={yOf(d.beta)} r={4} fill={ZONE_COLORS[d.zone]} stroke={t.surface} strokeWidth={1.5} />
        </g>
      ))}
      <text x={172} y={8} fontSize={7.5} fontFamily={TYPE.mono} fill={t.inkMuted}>{top}</text>
      <text x={172} y={82} fontSize={7.5} fontFamily={TYPE.mono} fill={t.inkMuted}>{bottom}</text>
    </svg>
  );
}

/** ② Two questions feeding one gauge — and why it runs 0 to 1.5. */
function VisTwoQuestions() {
  const x = (v: number) => 8 + (v / BETA_SCALE.max) * 174;
  return (
    <svg viewBox="0 0 190 84" width="100%" style={{ display: "block", maxWidth: 210 }} aria-hidden="true">
      {/* the two questions */}
      <rect x={4} y={4} width={104} height={17} rx={8.5} fill={t.surface} stroke={t.line} strokeWidth={1.2} />
      <text x={56} y={15.5} textAnchor="middle" fontSize={8.5} fontFamily={TYPE.mono} fill={t.ink}>could AI do it?</text>
      <rect x={4} y={26} width={104} height={17} rx={8.5} fill={t.surface} stroke={t.line} strokeWidth={1.2} />
      <text x={56} y={37.5} textAnchor="middle" fontSize={8.5} fontFamily={TYPE.mono} fill={t.ink}>with tools? ×½</text>
      {/* both feed the gauge */}
      <path d="M110,12 C130,12 136,50 148,56 M110,34 C126,36 132,50 144,55" fill="none" stroke={t.line} strokeWidth={1.2} />
      {/* the gauge: 0 → 1.0 (first question) + 1.0 → 1.5 (the tools half) */}
      <rect x={x(0)} y={58} width={x(1) - x(0)} height={7} rx={3.5} fill={t.ink} opacity={0.5} />
      <rect x={x(1)} y={58} width={x(1.5) - x(1)} height={7} rx={3.5} fill={t.brass} opacity={0.5} />
      <text x={x(0)} y={78} fontSize={8} fontFamily={TYPE.mono} fill={t.inkMuted}>0</text>
      <text x={x(1)} y={78} textAnchor="middle" fontSize={8} fontFamily={TYPE.mono} fill={t.inkMuted}>1.0</text>
      <text x={x(1.5)} y={78} textAnchor="end" fontSize={8} fontFamily={TYPE.mono} fill={t.brass}>1.5</text>
      <text x={(x(1) + x(1.5)) / 2} y={54} textAnchor="middle" fontSize={7.5} fontFamily={TYPE.mono} fill={t.brass}>+ tools</text>
    </svg>
  );
}

/** ③ The reading is a depth — three tasks on the shore, one waterline. */
function VisDepth({ labels }: { labels: [string, string, string] }) {
  const wl = 40; // waterline y
  return (
    <svg viewBox="0 0 190 84" width="100%" style={{ display: "block", maxWidth: 210 }} aria-hidden="true">
      {/* water below the line */}
      <rect x={0} y={wl} width={190} height={44} fill={t.current} opacity={0.14} />
      <line x1={0} y1={wl} x2={190} y2={wl} stroke={t.current} strokeWidth={2} />
      {/* stepped shore, high ground left → deep right */}
      <path d="M0,22 L58,22 L58,50 L122,50 L122,72 L190,72" fill="none" stroke={t.inkMuted} strokeWidth={1.3} opacity={0.6} />
      {/* tasks sitting at their depths */}
      <circle cx={29} cy={18.5} r={4.5} fill={ZONE_COLORS.E0} stroke={t.surface} strokeWidth={1.5} />
      <circle cx={90} cy={46.5} r={4.5} fill={ZONE_COLORS.E1} stroke={t.surface} strokeWidth={1.5} />
      <circle cx={156} cy={68.5} r={4.5} fill={ZONE_COLORS.E2} stroke={t.surface} strokeWidth={1.5} />
      <text x={29} y={10} textAnchor="middle" fontSize={8} fontFamily={TYPE.mono} fill={t.inkMuted}>{labels[0]}</text>
      <text x={90} y={62} textAnchor="middle" fontSize={8} fontFamily={TYPE.mono} fill={t.inkMuted}>{labels[1]}</text>
      <text x={156} y={82} textAnchor="middle" fontSize={8} fontFamily={TYPE.mono} fill={t.inkMuted}>{labels[2]}</text>
    </svg>
  );
}

// ── The three beats — the same arc in either register (#79) ──

const stepsFor = (plain: boolean): { n: string; title: string; body: string; visual: JSX.Element }[] => [
  {
    n: "①",
    title: "A job is a bundle of tasks",
    body: plain
      ? "AI doesn't take jobs whole — it reaches the tasks inside them, one by one. Some are affected early; others barely feel it."
      : "AI doesn't take jobs whole — it reaches the tasks inside them, one by one. Some sink early; others barely feel it.",
    visual: plain ? <VisJobToTasks top="low" bottom="high" /> : <VisJobToTasks top="dry" bottom="deep" />,
  },
  {
    n: "②",
    title: "Two questions make the reading",
    body: "Could today's AI meaningfully do this task by itself? Could it with purpose-built tools on top? A task can score on both — which is why the scale runs 0 to 1.5, not 0 to 1.",
    visual: <VisTwoQuestions />,
  },
  {
    n: "③",
    title: plain ? "The reading is a level" : "The reading is a depth",
    body: plain
      ? "Low scores stay mostly human; high scores are within AI's reach today. The line is today's AI capability — the same for every job. Drag it below and watch a real one."
      : "Low readings hold the high ground; high readings sit deeper. The waterline is today's AI capability — one tide, every job. Drag it below and watch a real one.",
    visual: plain
      ? <VisDepth labels={["mostly human", "AI-assisted", "automatable"]} />
      : <VisDepth labels={["dry", "at the line", "under"]} />,
  },
];

export function ReadingPrimer() {
  const { mode } = useLanguage();
  const STEPS = stepsFor(mode === "plain");
  return (
    <div style={{ fontFamily: TYPE.body, color: t.ink, marginBottom: 26 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px 28px" }}>
        {STEPS.map((s) => (
          <div key={s.n} style={{ flex: "1 1 220px", maxWidth: 320, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: TYPE.mono, fontSize: 15, color: t.brass }}>{s.n}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</span>
            </div>
            {s.visual}
            <p style={{ fontSize: 12.5, color: t.inkMuted, lineHeight: 1.55, margin: "8px 0 0" }}>{s.body}</p>
          </div>
        ))}
      </div>
      {/* Provenance — where the number actually comes from */}
      <div style={{ fontSize: 11, color: t.inkMuted, fontStyle: "italic", marginTop: 16 }}>
        Readings come from the Eloundou 2024 task-exposure study ("GPTs are GPTs"), cross-checked
        against measured AI usage from Microsoft and Anthropic.{" "}
        <Link to="/methodology" style={{ color: t.brass, fontWeight: 600, textDecoration: "none", fontStyle: "normal" }}>
          How this works →
        </Link>
      </div>
    </div>
  );
}
