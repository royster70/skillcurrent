import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { THEME, TYPE, BRASS_TINT } from "../lib/constants";
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

// Two groups for the open-source audiences: EXPLORE = the data views;
// UNDERSTAND = methodology + sources (primary destinations for researchers
// and contributors — previously orphan pages reachable only from the landing).
const NAV_GROUPS = [
  {
    label: "EXPLORE",
    items: [
      { to: "/", label: "Waterline", Icon: IconWaterline },
      { to: "/sectors", label: "Sectors", Icon: IconSectors },
      { to: "/search", label: "Role Search", Icon: IconSearch },
      { to: "/occupations", label: "Occupations", Icon: IconOccupations },
      { to: "/tide", label: "Rising Tide", Icon: IconTide },
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
  const [collapsed, setCollapsed] = useState(false);

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
          <button
            onClick={() => setCollapsed(!collapsed)}
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
        </div>

        {!collapsed && (
          <div style={{ fontSize: 11.5, lineHeight: 1.4, color: t.inkMuted, marginBottom: 22, maxWidth: 200 }}>
            Open intelligence for the changing world of work
          </div>
        )}

        {NAV_GROUPS.map((group, gi) => (
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
