import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { THEME, TYPE, BRASS_TINT } from "../lib/constants";
import { useLanguage } from "../lib/language";
import type { Lexicon, LanguageMode } from "../lib/lexicon";
import { useRegion, type Region } from "../lib/region";
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

// Below this viewport width the expanded 264px rail crowds the content. Instead
// of a permanent icon rail (which ate ~17% of a 375px phone and hid its labels
// behind hover-titles, #76), narrow viewports get a top bar + overlay drawer.
const NARROW_BREAKPOINT = 768;

// Two groups for the open-source audiences: EXPLORE = the data views;
// UNDERSTAND = methodology + sources. A function of the lexicon (#79): the "/"
// and "/tide" labels change words per mode, never the routes.
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

interface SidebarProps {
  groups: ReturnType<typeof navGroups>;
  datasets: ReturnType<typeof useApi<Awaited<ReturnType<typeof api.datasets>>>>["data"];
  region: Region;
  setRegion: (r: Region) => void;
  mode: LanguageMode;
  setMode: (m: LanguageMode) => void;
  /** Collapsed icon-only rail (wide screens only). Always false in the drawer. */
  collapsed: boolean;
  /** Called when a nav link is followed — used by the drawer to close itself. */
  onNavigate?: () => void;
}

/** The nav body shared by the wide rail and the mobile drawer (#76). */
function SidebarBody({ groups, datasets, region, setRegion, mode, setMode, collapsed, onNavigate }: SidebarProps) {
  return (
    <>
      {groups.map((group, gi) => (
        <div key={group.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {!collapsed && (
            <div style={{ fontSize: 10.5, color: t.inkMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 6, marginTop: gi > 0 ? 18 : 0 }}>
              {group.label}
            </div>
          )}
          {collapsed && gi > 0 && <div style={{ borderTop: `1px solid ${t.line}`, margin: "10px 6px" }} />}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 9,
                padding: collapsed ? "10px 0" : "8px 12px", borderRadius: 7, textDecoration: "none",
                fontSize: collapsed ? 19 : 14, fontWeight: isActive ? 600 : 500,
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

      {/* "Run this yourself" strip — the self-hoster entry point */}
      <NavLink
        to="/run"
        onClick={onNavigate}
        title={collapsed ? "Run this yourself" : undefined}
        style={({ isActive }) => ({
          marginTop: "auto", display: "flex", alignItems: "center", gap: 9,
          padding: collapsed ? "10px 0" : "9px 12px", borderRadius: 8,
          border: `1px ${isActive ? "solid" : "dashed"} ${isActive ? t.brass : t.line}`,
          backgroundColor: isActive ? BRASS_TINT : "transparent", textDecoration: "none",
          fontSize: 12.5, fontWeight: 600, color: isActive ? t.brass : t.inkMuted,
          justifyContent: collapsed ? "center" : "flex-start", transition: "all 0.15s ease",
        })}
      >
        <IconTerminal size={collapsed ? 18 : 15} style={{ flexShrink: 0 }} />
        {!collapsed && <span>Open by design — run this yourself</span>}
      </NavLink>

      {/* Labour market (#74) */}
      {!collapsed ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10.5, color: t.inkMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>LABOUR MARKET</div>
          <RegionSelector region={region} onChange={(r) => setRegion(r === "AU" ? "AU" : "US")} />
        </div>
      ) : (
        <button
          onClick={() => setRegion(region === "US" ? "AU" : "US")}
          aria-label={`Labour market: ${region}. Switch to ${region === "US" ? "AU" : "US"}`}
          title={`Labour market: ${region} — click to switch`}
          style={{ marginTop: 12, padding: "6px 0", width: "100%", borderRadius: 6, border: `1px solid ${t.line}`, background: t.surface, cursor: "pointer", fontSize: 11, fontWeight: 700, color: t.inkMuted, fontFamily: TYPE.mono }}
        >
          {region}
        </button>
      )}

      {/* Language mode (#79) */}
      {!collapsed ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10.5, color: t.inkMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>LANGUAGE</div>
          <div role="group" aria-label="Language mode" style={{ display: "flex", borderRadius: 8, border: `1px solid ${t.line}`, overflow: "hidden" }}>
            {(["plain", "nautical"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                title={m === "plain" ? "Plain language — simple terms lead" : "Nautical language — the chart-room vocabulary"}
                style={{ flex: 1, padding: "6px 0", fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: TYPE.body, backgroundColor: mode === m ? BRASS_TINT : t.surface, color: mode === m ? t.brass : t.inkMuted }}
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
          style={{ marginTop: 12, padding: "6px 0", width: "100%", borderRadius: 6, border: `1px solid ${t.line}`, background: t.surface, cursor: "pointer", fontSize: 11, fontWeight: 700, color: t.inkMuted, fontFamily: TYPE.mono }}
        >
          {mode === "plain" ? "Aa" : "⚓"}
        </button>
      )}

      {/* Data vintage */}
      {!collapsed && (
        <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 16, marginTop: 12 }}>
          <div style={{ fontSize: 10.5, color: t.inkMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>DATA SOURCES</div>
          {datasets?.datasets.map((d) => (
            <div key={d.dataset_name} style={{ fontSize: 11, fontFamily: TYPE.mono, color: t.inkMuted, marginBottom: 3 }}>
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
          <div style={{ fontSize: 10, fontFamily: TYPE.mono, color: t.inkMuted, writingMode: "vertical-rl", transform: "rotate(180deg)", margin: "0 auto" }}>
            {datasets.total_rows.toLocaleString()} rows
          </div>
        </div>
      )}
    </>
  );
}

const Wordmark = ({ size = 21 }: { size?: number }) => (
  <div style={{ fontFamily: TYPE.display, fontSize: size, fontWeight: 600, color: t.ink, letterSpacing: -0.3 }}>
    Skill
    <span style={{ position: "relative", color: t.brass }}>
      Current
      <WaveUnderline />
    </span>
  </div>
);

// Human page title for the mobile top bar — derived from the route.
function pageTitle(pathname: string, lex: Lexicon): string {
  if (pathname === "/") return lex.nav.home;
  if (pathname.startsWith("/tide")) return lex.nav.tide;
  if (pathname.startsWith("/sectors")) return "Sectors";
  if (pathname.startsWith("/search")) return "Role Search";
  if (pathname.startsWith("/occupations")) return "Occupations";
  if (pathname.startsWith("/methodology")) return "How it works";
  if (pathname.startsWith("/sources")) return "Data & sources";
  if (pathname.startsWith("/run")) return "Run this yourself";
  return "SkillCurrent";
}

export function Layout() {
  const { data: datasets } = useApi(() => api.datasets(), []);
  const { mode, setMode, lex } = useLanguage();
  const { region, setRegion } = useRegion();
  const groups = useMemo(() => navGroups(lex), [lex]);
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < NARROW_BREAKPOINT,
  );
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    setIsNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Leaving narrow mode closes the drawer so it can't linger off-canvas.
  useEffect(() => {
    if (!isNarrow) setDrawerOpen(false);
  }, [isNarrow]);

  // Drawer focus + Escape handling (#76 / a11y): move focus into the drawer on
  // open, restore it to the menu button on close, close on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    // Capture the trigger now so cleanup restores focus to the element that
    // was current when the drawer opened (react-hooks/exhaustive-deps).
    const trigger = menuButtonRef.current;
    drawerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [drawerOpen]);

  const sidebarProps: Omit<SidebarProps, "collapsed" | "onNavigate"> = {
    groups, datasets, region, setRegion, mode, setMode,
  };

  // ── Narrow: top bar + overlay drawer ──
  if (isNarrow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: TYPE.body, color: t.ink }}>
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", backgroundColor: t.surface, borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
          <button
            ref={menuButtonRef}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            style={{ background: "none", border: `1px solid ${t.line}`, borderRadius: 8, cursor: "pointer", color: t.ink, padding: "6px 10px", fontSize: 18, lineHeight: 1 }}
          >
            ☰
          </button>
          <Wordmark size={18} />
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: t.inkMuted }}>
            {pageTitle(location.pathname, lex)}
          </span>
        </header>

        {drawerOpen && (
          <>
            <div
              onClick={() => setDrawerOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(14,31,39,0.4)", zIndex: 40 }}
            />
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              tabIndex={-1}
              style={{
                position: "fixed", top: 0, left: 0, bottom: 0, width: 264, maxWidth: "85vw", zIndex: 50,
                backgroundColor: t.surface, borderRight: `1px solid ${t.line}`, outline: "none",
                display: "flex", flexDirection: "column", gap: 3, padding: "16px 16px", overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Wordmark />
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  style={{ background: "none", border: `1px solid ${t.line}`, borderRadius: 6, cursor: "pointer", color: t.inkMuted, padding: "4px 10px", fontSize: 16, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
              <SidebarBody {...sidebarProps} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </>
        )}

        <main style={{ flex: 1, overflow: "auto", backgroundColor: t.ground, padding: 16 }}>
          <Outlet />
        </main>
      </div>
    );
  }

  // ── Wide: the classic rail (manual collapse toggle) ──
  const collapsed = userCollapsed;
  const sidebarWidth = collapsed ? 64 : 264;
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: TYPE.body, color: t.ink }}>
      <nav
        style={{
          width: sidebarWidth, minWidth: sidebarWidth, backgroundColor: t.surface,
          borderRight: `1px solid ${t.line}`, display: "flex", flexDirection: "column",
          padding: collapsed ? "22px 8px" : "22px 16px", gap: 3, transition: "all 0.2s ease",
          overflowX: "hidden", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed ? 16 : 2 }}>
          {!collapsed && <Wordmark />}
          <button
            onClick={() => setUserCollapsed((v) => !v)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ background: "none", border: "none", cursor: "pointer", color: t.inkMuted, fontSize: 15, padding: 4, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", width: collapsed ? "100%" : "auto" }}
          >
            {collapsed ? "▶" : "◀"}
          </button>
        </div>

        {!collapsed && (
          <div style={{ fontSize: 11.5, lineHeight: 1.4, color: t.inkMuted, marginBottom: 22, maxWidth: 200 }}>
            Open intelligence for the changing world of work
          </div>
        )}

        <SidebarBody {...sidebarProps} collapsed={collapsed} />
      </nav>

      <main style={{ flex: 1, overflow: "auto", backgroundColor: t.ground, padding: 32 }}>
        <Outlet />
      </main>
    </div>
  );
}
