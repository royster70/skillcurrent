import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";
import { THEME, TYPE } from "../lib/constants";
import { WaveUnderline } from "./current/CurrentFlow";

const t = THEME.light;
const BRASS_TINT = "rgba(156, 100, 20, 0.10)"; // brass #9c6414 @ 10%

const navItems = [
  { to: "/", label: "Waterline", icon: "🌊" },
  { to: "/sectors", label: "Sectors", icon: "📊" },
  { to: "/search", label: "Role Search", icon: "🔍" },
  { to: "/occupations", label: "Occupations", icon: "👥" },
  { to: "/drift", label: "Drift Analysis", icon: "📈" },
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
          overflow: "hidden",
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

        {!collapsed && (
          <div
            style={{
              fontSize: 10.5,
              color: t.inkMuted,
              fontWeight: 600,
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            INDUSTRY INTELLIGENCE
          </div>
        )}

        {navItems.map((item) => (
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
            <span style={{ fontSize: collapsed ? 18 : 15, opacity: 0.9 }}>{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}

        {/* Data vintage at bottom */}
        {!collapsed && (
          <div style={{ marginTop: "auto", borderTop: `1px solid ${t.line}`, paddingTop: 16 }}>
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
          <div style={{ marginTop: "auto", textAlign: "center" }}>
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
