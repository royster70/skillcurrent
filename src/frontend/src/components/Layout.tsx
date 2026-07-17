import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { THEME, TYPE, BRASS_TINT } from "../lib/constants";
import { useLanguage } from "../lib/language";
import type { Lexicon } from "../lib/lexicon";
import { useRegion } from "../lib/region";
import { RegionSelector } from "./RegionSelector";
import { WaveUnderline } from "./current/CurrentFlow";
import {
  IconWaterline,
  IconSectors,
  IconSearch,
  IconOccupations,
  IconTide,
  IconAnchor,
  IconSources,
  IconTerminal,
} from "./current/icons";

const t = THEME.light;

// Below this viewport width the expanded 264px rail crowds the content (and, in
// very narrow embeds/previews, overflows the page). Force the collapsed icon
// rail there; above it, the user's manual toggle wins.
const NARROW_BREAKPOINT = 768;

// Two groups for the open-source audiences: EXPLORE = the data views;
// UNDERSTAND = methodology + sources (primary destinations for researchers
// and contributors — previously orphan pages reachable only from the landing).
// A function of the lexicon (#79): the two most prominent jargon terms in the
// app are the "/" and "/tide" nav labels — mode changes the words, never the
// routes (App.tsx paths and the README route-parity check are untouched).
const navGroups = (lex: Lexicon) => [
  {
    label: "EXPLORE",
    items: [
      { to: "/", label: lex.nav.home, Icon: IconWaterline },
      { to: "/sectors", label: "Sectors", Icon: IconSectors },
      { to: "/search", label: "Role Search", Icon: IconSearch },
      { to: "/occupations", label: "Occupations", Icon: IconOccupations },
      { to: "/tide", label: lex.nav.tide, Icon: IconTide },
    ],
  },
  {
    label: "UNDERSTAND",
    items: [
      { to: "/methodology", label: "How it works", Icon: IconAnchor },
      { to: "/sources", label: "Data & sources", Icon: IconSources },
    ],
  },
];

export function Layout() {
  const { data: datasets } = useApi(() => api.datasets(), []);
  const { mode, setMode, lex } = useLanguage();
  const { region, setRegion } = useRegion();
  const groups = useMemo(() => navGroups(lex), [lex]);
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < NARROW_BREAKPOINT,
  );

  // Track the breakpoint via matchMedia — fires only when the line is crossed,
  // not on every resize pixel.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    setIsNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Narrow viewports force the collapsed rail; otherwise honour the manual toggle.
  const collapsed = userCollapsed || isNarrow;
  const sidebarWidth = collapsed ? 64 : 264;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: TYPE.body, color: t.ink }}>
      {/* Sidebar */}
      <nav
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          backgroundColor: t.surface,
          borderRight: `1px solid ${t.line}`,
          display: "flex",
          flexDirection: "column",
          padding: collapsed ? "22px 8px" : "22px 16px",
          gap: 3,
          transition: "all 0.2s ease",
          overflowX: "hidden",
          overflowY: "auto", // short viewports can still reach the lower nav + run strip
        }}
      >
        {/* Brand + collapse toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: collapsed ? 16 : 2,
          }}
        >
          {!collapsed && (
            <div style={{ fontFamily: TYPE.display, fontSize: 21, fontWeight: 600, color: t.ink, letterSpacing: -0.3 }}>
              Skill
              <span style={{ position: "relative", color: t.brass }}>
                Current
                <WaveUnderline />
              </span>
            </div>
          )}
          {/* Manual toggle only when there's room to expand — on narrow
              viewports the rail is forced collapsed, so the control would be
              a no-op. */}
          {!isNarrow && (
            <button
              onClick={() => setUserCollapsed((v) => !v)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: t.inkMuted,
                fontSize: 15,
                padding: 4,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: collapsed ? "100%" : "auto",
              }}
            >
              {collapsed ? "▶" : "◀"}
            </button>
          )}
        </div>

        {!collapsed && (
          <div style={{ fontSize: 11.5, lineHeight: 1.4, color: t.inkMuted, marginBottom: 22, maxWidth: 200 }}>
            Open intelligence for the changing world of work
          </div>
        )}

        {groups.map((group, gi) => (
          <div key={group.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {!collapsed && (
              <div
                style={{
                  fontSize: 10.5,
                  color: t.inkMuted,
                  fontWeight: 600,
                  letterSpacing: 1,
                  marginBottom: 6,
                  marginTop: gi > 0 ? 18 : 0,
                }}
              >
                {group.label}
              </div>
            )}
            {collapsed && gi > 0 && (
              <div style={{ borderTop: `1px solid ${t.line}`, margin: "10px 6px" }} />
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                title={collapsed ? item.label : undefined}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: collapsed ? "10px 0" : "8px 12px",
                  borderRadius: 7,
                  textDecoration: "none",
                  fontSize: collapsed ? 19 : 14,
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? BRASS_TINT : "transparent",
                  color: isActive ? t.brass : t.inkMuted,
                  justifyContent: collapsed ? "center" : "flex-start",
                  transition: "all 0.15s ease",
                })}
              >
                <item.Icon size={collapsed ? 19 : 17} style={{ flexShrink: 0 }} />
                {!collapsed && item.label}
              </NavLink>
            ))}
          </div>
        ))}

        {/* "Run this yourself" strip (design 8c) — the self-hoster entry point */}
        <NavLink
          to="/run"
          title={collapsed ? "Run this yourself" : undefined}
          style={({ isActive }) => ({
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: collapsed ? "10px 0" : "9px 12px",
            borderRadius: 8,
            border: `1px ${isActive ? "solid" : "dashed"} ${isActive ? t.brass : t.line}`,
            backgroundColor: isActive ? BRASS_TINT : "transparent",
            textDecoration: "none",
            fontSize: 12.5,
            fontWeight: 600,
            color: isActive ? t.brass : t.inkMuted,
            justifyContent: collapsed ? "center" : "flex-start",
            transition: "all 0.15s ease",
          })}
        >
          <IconTerminal size={collapsed ? 18 : 15} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Open by design — run this yourself</span>}
        </NavLink>

        {/* Labour market (#74) — global, quietly persisted (URL still wins).
            The badge on each result view says which market the data is from;
            this is where the visitor changes it. */}
        {!collapsed ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10.5, color: t.inkMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>
              LABOUR MARKET
            </div>
            <RegionSelector region={region} onChange={(r) => setRegion(r === "AU" ? "AU" : "US")} />
          </div>
        ) : (
          <button
            onClick={() => setRegion(region === "US" ? "AU" : "US")}
            aria-label={`Labour market: ${region}. Switch to ${region === "US" ? "AU" : "US"}`}
            title={`Labour market: ${region} — click to switch`}
            style={{
              marginTop: 12, padding: "6px 0", width: "100%", borderRadius: 6,
              border: `1px solid ${t.line}`, background: t.surface, cursor: "pointer",
              fontSize: 11, fontWeight: 700, color: t.inkMuted, fontFamily: TYPE.mono,
            }}
          >
            {region}
          </button>
        )}

        {/* Language mode (#79) — plain words by default, the nautical brand
            vocabulary one click away. The toggle IS the language trial. */}
        {!collapsed ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10.5, color: t.inkMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>
              LANGUAGE
            </div>
            <div role="group" aria-label="Language mode" style={{ display: "flex", borderRadius: 8, border: `1px solid ${t.line}`, overflow: "hidden" }}>
              {(["plain", "nautical"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  title={m === "plain" ? "Plain language — simple terms lead" : "Nautical language — the chart-room vocabulary"}
                  style={{
                    flex: 1, padding: "6px 0", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                    border: "none", fontFamily: TYPE.body,
                    backgroundColor: mode === m ? BRASS_TINT : t.surface,
                    color: mode === m ? t.brass : t.inkMuted,
                  }}
                >
                  {m === "plain" ? "Plain" : "Nautical"}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setMode(mode === "plain" ? "nautical" : "plain")}
            aria-label={`Language: ${mode}. Switch to ${mode === "plain" ? "nautical" : "plain"}`}
            title={`Language: ${mode} — click to switch`}
            style={{
              marginTop: 12, padding: "6px 0", width: "100%", borderRadius: 6,
              border: `1px solid ${t.line}`, background: t.surface, cursor: "pointer",
              fontSize: 11, fontWeight: 700, color: t.inkMuted, fontFamily: TYPE.mono,
            }}
          >
            {mode === "plain" ? "Aa" : "⚓"}
          </button>
        )}

        {/* Data vintage at bottom */}
        {!collapsed && (
          <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 16, marginTop: 12 }}>
            <div
              style={{
                fontSize: 10.5,
                color: t.inkMuted,
                fontWeight: 600,
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              DATA SOURCES
            </div>
            {datasets?.datasets.map((d) => (
              <div
                key={d.dataset_name}
                style={{ fontSize: 11, fontFamily: TYPE.mono, color: t.inkMuted, marginBottom: 3 }}
              >
                {d.dataset_name} · v{d.version_key}
              </div>
            ))}
            {datasets && (
              <div style={{ fontSize: 11, fontFamily: TYPE.mono, color: t.brass, marginTop: 8, fontWeight: 600 }}>
                {datasets.total_rows.toLocaleString()} rows
              </div>
            )}
          </div>
        )}

        {collapsed && datasets && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: TYPE.mono,
                color: t.inkMuted,
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                margin: "0 auto",
              }}
            >
              {datasets.total_rows.toLocaleString()} rows
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          backgroundColor: t.ground,
          padding: 32,
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
