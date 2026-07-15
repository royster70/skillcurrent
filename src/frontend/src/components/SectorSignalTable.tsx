/**
 * SectorSignalTable — the sector reference grid as a micro-instrument.
 *
 * Replaces the bare 9-column "Sectors by Employment" digits table. Same data,
 * read the redesign's way:
 *   · Employment / E2 workers — mono number over a quiet data-bar (scaled to
 *     the column max), so magnitude reads at a glance.
 *   · Signals — the three sources as per-source coloured bars (SIGNAL_COLORS,
 *     the provenance hues, NEVER zone hues). Each bar is normalised to its
 *     OWN column max — the sources live on different scales (Eloundou 0–1.5,
 *     Microsoft 0–0.49, AEI ~0–1), so bars compare sectors within a signal,
 *     never signals against each other.
 *   · Occupations by zone — the three E0/E1/E2 count columns collapse into
 *     one stacked strip (zone hues carry fixed meaning), counts on hover.
 * Headers with a ▾ are click-to-sort; rows click through to the sector.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SectorSummary } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS, ZONE_LABELS, SIGNAL_COLORS } from "../lib/constants";

const t = THEME.light;

type SortKey = "employment" | "e2workers" | "occupations";

const ACCESSOR: Record<SortKey, (s: SectorSummary) => number> = {
  employment: (s) => s.total_employment ?? 0,
  e2workers: (s) => s.workers_e2,
  occupations: (s) => s.occupation_count,
};

const SIGNALS = [
  { key: "eloundou", tag: "ELO", name: "Eloundou β (theoretical exposure, 0–1.5)", color: SIGNAL_COLORS.eloundou, of: (s: SectorSummary) => s.weighted_eloundou_beta },
  { key: "microsoft", tag: "MS", name: "Microsoft AI applicability (empirical Copilot usage, 0–0.49)", color: SIGNAL_COLORS.microsoft, of: (s: SectorSummary) => s.weighted_ms_applicability },
  { key: "aei", tag: "AEI", name: "Anthropic Economic Index exposure (empirical Claude usage)", color: SIGNAL_COLORS.aei, of: (s: SectorSummary) => s.weighted_aei_exposure },
] as const;

export function SectorSignalTable({ sectors, region }: { sectors: SectorSummary[]; region: string }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>("employment");

  const rows = useMemo(
    () => [...sectors].sort((a, b) => ACCESSOR[sort](b) - ACCESSOR[sort](a)),
    [sectors, sort],
  );

  // Per-column maxima — every bar is "relative to other sectors on this column".
  const maxes = useMemo(() => ({
    employment: Math.max(...sectors.map((s) => s.total_employment ?? 0), 1),
    e2workers: Math.max(...sectors.map((s) => s.workers_e2), 1),
    signals: SIGNALS.map((sig) => Math.max(...sectors.map((s) => sig.of(s) ?? 0), 1e-9)),
  }), [sectors]);

  return (
    <div style={{ background: t.surface, borderRadius: 12, border: `1.5px solid ${t.line}`, overflow: "hidden", fontFamily: TYPE.body, color: t.ink }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}` }}>
        <span style={{ fontFamily: TYPE.display, fontSize: 16, fontWeight: 600 }}>The reference grid</span>
        <span style={{ fontSize: 12, fontWeight: 400, color: t.inkMuted, marginLeft: 8 }}>
          Every sector, every signal — employment-weighted · click ▾ headers to sort
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: t.ground }}>
              <th style={th}>Sector</th>
              <SortableTh label="Employment" k="employment" sort={sort} onSort={setSort} />
              <th style={{ ...th, width: 190 }}>Signals · per-source scale</th>
              <SortableTh label="Occupations by zone" k="occupations" sort={sort} onSort={setSort} width={150} />
              <SortableTh label="E2 workers" k="e2workers" sort={sort} onSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <Row key={s.naics_code} s={s} maxes={maxes}
                onOpen={() => navigate(`/sectors/${s.naics_code}${region === "AU" ? "?region=AU" : ""}`)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableTh({ label, k, sort, onSort, width }: { label: string; k: SortKey; sort: SortKey; onSort: (k: SortKey) => void; width?: number }) {
  const active = sort === k;
  return (
    <th
      onClick={() => onSort(k)}
      style={{ ...th, width, textAlign: "right", cursor: "pointer", color: active ? t.brass : t.inkMuted, userSelect: "none" }}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label} <span style={{ opacity: active ? 1 : 0.35 }}>▾</span>
    </th>
  );
}

function Row({ s, maxes, onOpen }: {
  s: SectorSummary;
  maxes: { employment: number; e2workers: number; signals: number[] };
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <tr
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderTop: `1px solid ${t.line}`, cursor: "pointer", background: hover ? t.ground : "transparent", transition: "background 0.15s" }}
    >
      <td style={{ ...td, fontWeight: 500 }}>{s.naics_title}</td>
      <td style={{ ...td, width: 110 }}>
        <BarNumber value={s.total_employment ?? 0} max={maxes.employment} color={t.inkMuted} label={fmtEmp(s.total_employment)} />
      </td>
      <td style={{ ...td, width: 190 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {SIGNALS.map((sig, i) => (
            <SignalBar key={sig.key} tag={sig.tag} name={sig.name} value={sig.of(s)} max={maxes.signals[i]} color={sig.color} />
          ))}
        </div>
      </td>
      <td style={{ ...td, width: 150 }}>
        <ZoneStrip s={s} />
      </td>
      <td style={{ ...td, width: 100 }}>
        <BarNumber value={s.workers_e2} max={maxes.e2workers} color={ZONE_COLORS.E2} label={fmtEmp(s.workers_e2)} />
      </td>
    </tr>
  );
}

/** A right-aligned mono number sitting on a quiet magnitude bar. */
function BarNumber({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: TYPE.mono, fontSize: 12.5, fontWeight: 600, textAlign: "right", color }}>{label}</div>
      <div style={{ height: 4, borderRadius: 2, background: `${color}1c`, marginTop: 3 }}>
        <div style={{ width: `${(value / max) * 100}%`, height: "100%", borderRadius: 2, background: color, opacity: 0.55, marginLeft: "auto" }} />
      </div>
    </div>
  );
}

/** One signal source: tag + bar (normalised to this signal's column max) + value. */
function SignalBar({ tag, name, value, max, color }: { tag: string; name: string; value: number | null; max: number; color: string }) {
  return (
    <div title={`${name} — bar scaled to the highest sector on this signal`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: TYPE.mono, fontSize: 8.5, fontWeight: 600, color, width: 24, letterSpacing: 0.3 }}>{tag}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: `${color}16` }}>
        {value != null && (
          <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: "100%", borderRadius: 3, background: color, opacity: 0.8 }} />
        )}
      </div>
      <span style={{ fontFamily: TYPE.mono, fontSize: 10.5, color: value != null ? t.ink : t.inkMuted, width: 38, textAlign: "right" }}>
        {value != null ? value.toFixed(3) : "—"}
      </span>
    </div>
  );
}

/** Occupation counts by zone as one stacked strip — zone hues, fixed meaning. */
function ZoneStrip({ s }: { s: SectorSummary }) {
  const counts = { E0: s.zone_e0_count, E1: s.zone_e1_count, E2: s.zone_e2_count } as const;
  const total = counts.E0 + counts.E1 + counts.E2;
  const breakdown = (["E0", "E1", "E2"] as const)
    .map((z) => `${ZONE_LABELS[z]} ${counts[z]}`)
    .join(" · ") + ` of ${total} occupations`;
  if (total === 0) return <span style={{ color: t.inkMuted }}>—</span>;
  return (
    <div title={breakdown}>
      <div style={{ display: "flex", gap: 1, height: 8 }}>
        {(["E0", "E1", "E2"] as const).map((z) =>
          counts[z] > 0 ? (
            <div key={z} style={{ width: `${(counts[z] / total) * 100}%`, minWidth: 2, background: ZONE_COLORS[z], opacity: 0.85, borderRadius: 2 }} />
          ) : null,
        )}
      </div>
      <div style={{ fontFamily: TYPE.mono, fontSize: 9.5, color: t.inkMuted, marginTop: 3, textAlign: "right" }}>{total} occ</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 16px", fontWeight: 600, fontSize: 11, color: t.inkMuted, letterSpacing: 0.5, textAlign: "left" };
const td: React.CSSProperties = { padding: "10px 16px", verticalAlign: "middle" };

function fmtEmp(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
