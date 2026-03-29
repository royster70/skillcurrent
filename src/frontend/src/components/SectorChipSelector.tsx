/**
 * SectorChipSelector — multi-select chip bar for building composite sector views.
 *
 * Shows a search dropdown to add sectors, removable chips with zone-coloured pips
 * for selected sectors, and an "Analyse N Sectors →" button that navigates to
 * the composite detail page when ≥2 sectors are selected.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { SectorSummary } from "../lib/api";
import { ZONE_COLORS, ZONE_BG } from "../lib/constants";

interface Props {
  sectors: SectorSummary[];
  selected: string[];
  onChange: (codes: string[]) => void;
  region?: string;
  companyName?: string | null;
}

export function SectorChipSelector({ sectors, selected, onChange, region = "US", companyName }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedSet = new Set(selected);
  const available = sectors.filter(
    (s) => !selectedSet.has(s.naics_code) &&
      s.naics_title.toLowerCase().includes(search.toLowerCase())
  );

  function addSector(code: string) {
    onChange([...selected, code]);
    setSearch("");
    setOpen(false);
  }

  function removeSector(code: string) {
    onChange(selected.filter((c) => c !== code));
  }

  function dominantZone(s: SectorSummary): "E0" | "E1" | "E2" {
    if (s.workers_e2 >= s.workers_e1 && s.workers_e2 >= s.workers_e0) return "E2";
    if (s.workers_e1 >= s.workers_e0) return "E1";
    return "E0";
  }

  function handleAnalyse() {
    if (selected.length >= 2) {
      const params = [`codes=${selected.join(",")}`, region === "AU" ? "region=AU" : ""];
      if (companyName) params.push(`company=${encodeURIComponent(companyName)}`);
      navigate(`/sectors/composite?${params.filter(Boolean).join("&")}`);
    }
  }

  const sectorMap = new Map(sectors.map((s) => [s.naics_code, s]));

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      borderRadius: 12, padding: "16px 20px",
      background: "#F8FAFC",
      border: "1.5px dashed #CBD5E1",
    }}>
      {/* Top row: add button + help text */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setOpen(!open)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "none", border: "none", cursor: "pointer",
              padding: 0, fontSize: 14, fontWeight: 500, color: "#2563EB",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
              stroke="#2563EB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx={12} cy={12} r={10} />
              <line x1={12} y1={8} x2={12} y2={16} />
              <line x1={8} y1={12} x2={16} y2={12} />
            </svg>
            {selected.length === 0 ? "Build composite view..." : "Add sector..."}
          </button>

          {/* Dropdown */}
          {open && (
            <div style={{
              position: "absolute", top: "100%", left: 0, zIndex: 50,
              marginTop: 4, width: 360,
              background: "#fff", borderRadius: 8,
              border: "1px solid #E4E4E7",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              overflow: "hidden",
            }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sectors..."
                style={{
                  width: "100%", padding: "10px 12px", border: "none",
                  borderBottom: "1px solid #E4E4E7", outline: "none",
                  fontSize: 13, fontFamily: "Inter, system-ui, sans-serif",
                }}
              />
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {available.length === 0 ? (
                  <div style={{ padding: "12px 16px", color: "#A1A1AA", fontSize: 13 }}>
                    {search ? "No matching sectors" : "All sectors selected"}
                  </div>
                ) : (
                  available.map((s) => {
                    const zone = dominantZone(s);
                    return (
                      <div
                        key={s.naics_code}
                        onClick={() => addSector(s.naics_code)}
                        style={{
                          padding: "8px 12px", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 8,
                          fontSize: 13, fontFamily: "Inter, system-ui, sans-serif",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F9FAFB")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          backgroundColor: ZONE_COLORS[zone],
                          flexShrink: 0,
                        }} />
                        <span style={{ flex: 1 }}>{s.naics_title}</span>
                        <span style={{ color: "#A1A1AA", fontSize: 12 }}>
                          {fmtEmp(s.total_employment)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <span style={{ fontSize: 12, color: "#94A3B8", fontFamily: "Inter, system-ui, sans-serif" }}>
          {selected.length < 2
            ? "Select 2+ sectors to compare"
            : `${selected.length} sectors selected`}
        </span>
      </div>

      {/* Chip row */}
      {selected.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {selected.map((code) => {
            const s = sectorMap.get(code);
            if (!s) return null;
            const zone = dominantZone(s);
            return (
              <div
                key={code}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  borderRadius: 99, padding: "6px 12px 6px 8px",
                  background: ZONE_BG[zone] || "#fff",
                  border: `1px solid ${ZONE_COLORS[zone]}40`,
                  fontSize: 13, fontWeight: 500,
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor: ZONE_COLORS[zone],
                }} />
                <span>{s.naics_title}</span>
                <button
                  onClick={() => removeSector(code)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: 0, marginLeft: 2, display: "flex", alignItems: "center",
                  }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                    stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1={18} y1={6} x2={6} y2={18} />
                    <line x1={6} y1={6} x2={18} y2={18} />
                  </svg>
                </button>
              </div>
            );
          })}

          {/* Analyse button */}
          <button
            onClick={handleAnalyse}
            disabled={selected.length < 2}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              borderRadius: 8, padding: "8px 16px",
              background: selected.length >= 2 ? "#2563EB" : "#94A3B8",
              color: "#fff", border: "none", cursor: selected.length >= 2 ? "pointer" : "default",
              fontSize: 13, fontWeight: 600,
              fontFamily: "Inter, system-ui, sans-serif",
              opacity: selected.length >= 2 ? 1 : 0.5,
              transition: "all 0.2s",
            }}
          >
            Analyse {selected.length} Sectors
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1={5} y1={12} x2={19} y2={12} />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function fmtEmp(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
