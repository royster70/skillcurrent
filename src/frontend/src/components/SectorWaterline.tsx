/**
 * SectorWaterline — every sector's workforce on the shared exposure scale.
 *
 * Replaces the zone pie + positioning scatter with ONE reading: each sector is
 * a stacked E0/E1/E2 composition bar (share of workers by zone, dry→submerged
 * left to right), row thickness = total employment, sorted deepest-first with
 * a "% submerged" readout. The pie's job (zone composition) and the scatter's
 * job (sector positioning + employment + E2 share) collapse into one mark.
 *
 * Design conventions (brand brief): ZONE_COLORS carry fixed zone meaning —
 * never decorative. Employment is subordinate (row thickness), never a second
 * spatial axis; the zone ordering along the row matches the app's one axis
 * (dry→submerged). This is a COMPOSITION, not β geometry — segment length is
 * worker share — so the header is a zone legend, deliberately NOT the
 * 0.40/0.85-ticked β scale header the Task Waterline uses.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SectorSummary } from "../lib/api";
import { THEME, TYPE, ZONE_COLORS, ZONE_LABELS } from "../lib/constants";

const t = THEME.light;

type ZoneKey = "E0" | "E1" | "E2";

// Shared row geometry: sector | bar | reading (same pattern as TaskWaterline).
const GRID = "minmax(120px, 1fr) clamp(150px, 42%, 340px) 76px";

interface Row {
  code: string;
  title: string;
  employment: number;
  share: Record<ZoneKey, number>; // worker share by zone, 0–1
  occupations: number;
}

export function SectorWaterline({ sectors, region }: { sectors: SectorSummary[]; region: string }) {
  const navigate = useNavigate();

  const rows = useMemo<Row[]>(() => {
    return sectors
      .filter((s) => s.total_employment != null && s.total_employment > 0)
      .map((s): Row => {
        const emp = s.total_employment as number;
        return {
          code: s.naics_code,
          title: s.naics_title,
          employment: emp,
          share: {
            E0: s.workers_e0 / emp,
            E1: s.workers_e1 / emp,
            E2: s.workers_e2 / emp,
          },
          occupations: s.occupation_count,
        };
      })
      .sort((a, b) => b.share.E2 - a.share.E2); // deepest workforce first
  }, [sectors]);

  const maxEmp = Math.max(...rows.map((r) => r.employment), 1);

  return (
    <div style={{ background: t.surface, borderRadius: 12, border: `1.5px solid ${t.line}`, padding: 20, fontFamily: TYPE.body, color: t.ink }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: TYPE.display, fontSize: 18, fontWeight: 600 }}>Sector waterline</div>
        <div style={{ fontSize: 12.5, color: t.inkMuted, marginTop: 2, maxWidth: 480, lineHeight: 1.4 }}>
          Each sector's workforce split across the scale — the further right, the deeper its people already sit.
        </div>
      </div>

      {/* Rows scroll inside the card on extreme-narrow viewports rather than
          stretching the page — the grid needs ~340px to stay legible. */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 340 }}>
          <DepthHeader />

          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((r) => (
              <SectorRow
                key={r.code}
                row={r}
                maxEmp={maxEmp}
                onOpen={() => navigate(`/sectors/${r.code}${region === "AU" ? "?region=AU" : ""}`)}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: t.inkMuted, fontStyle: "italic", marginTop: 10 }}>
        Bar length = share of the sector's workers whose occupation sits in each zone; row thickness = total employment.
      </div>
    </div>
  );
}

/** Composition header: a zone legend, NOT a β scale — segment length is share
 * of workers, so β threshold ticks would visually lie here. */
function DepthHeader() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "end", paddingBottom: 6, marginBottom: 4, borderBottom: `1px solid ${t.line}` }}>
      <div style={{ fontSize: 10.5, color: t.inkMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>Sector</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 9.5, fontWeight: 600, flexWrap: "wrap" }}>
        {(["E0", "E1", "E2"] as ZoneKey[]).map((z) => (
          <span key={z} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: ZONE_COLORS[z] }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: ZONE_COLORS[z] }} />
            {ZONE_LABELS[z]}
          </span>
        ))}
        <span style={{ fontWeight: 400, color: t.inkMuted, marginLeft: "auto", fontSize: 9 }}>share of workers →</span>
      </div>
      <div style={{ fontSize: 10.5, color: t.inkMuted, textAlign: "right", textTransform: "uppercase", letterSpacing: 0.4 }}>Submerged</div>
    </div>
  );
}

function SectorRow({ row, maxEmp, onOpen }: { row: Row; maxEmp: number; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const empScale = Math.sqrt(row.employment / maxEmp); // area-honest weighting
  const breakdown =
    `${ZONE_LABELS.E0} ${(row.share.E0 * 100).toFixed(0)}% · ` +
    `${ZONE_LABELS.E1} ${(row.share.E1 * 100).toFixed(0)}% · ` +
    `${ZONE_LABELS.E2} ${(row.share.E2 * 100).toFixed(0)}% of ${fmtEmp(row.employment)} workers`;

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={breakdown}
      style={{
        display: "grid", gridTemplateColumns: GRID, gap: 12, alignItems: "center",
        padding: "9px 6px", borderBottom: `1px solid ${t.line}`, borderRadius: 6,
        cursor: "pointer", background: hover ? t.ground : "transparent",
        transition: "background 0.15s",
      }}
    >
      {/* Sector name + weight-in-words (the precise number the mark can't carry) */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{row.title}</div>
        <div style={{ fontSize: 11, color: t.inkMuted, fontFamily: TYPE.mono }}>
          {fmtEmp(row.employment)} workers · {row.occupations} occupations
        </div>
      </div>

      <DepthBar row={row} empScale={empScale} />

      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: TYPE.mono, fontSize: 13, fontWeight: 600, color: ZONE_COLORS.E2 }}>
          {(row.share.E2 * 100).toFixed(0)}%
        </div>
        <div style={{ fontSize: 8.5, color: t.inkMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>submerged</div>
      </div>
    </div>
  );
}

/** The depth bar: 100%-stacked worker share by zone, dry→submerged.
 * Row thickness carries employment. */
function DepthBar({ row, empScale }: { row: Row; empScale: number }) {
  const h = Math.round(10 + empScale * 16); // 10–26px
  return (
    <div style={{ display: "flex", gap: 2, height: h, alignItems: "stretch" }}>
      {(["E0", "E1", "E2"] as ZoneKey[]).map((z) =>
        row.share[z] > 0.005 ? (
          <div
            key={z}
            style={{
              width: `${row.share[z] * 100}%`,
              background: ZONE_COLORS[z],
              opacity: 0.85,
              borderRadius: 3,
              minWidth: 2,
            }}
          />
        ) : null,
      )}
    </div>
  );
}

function fmtEmp(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
