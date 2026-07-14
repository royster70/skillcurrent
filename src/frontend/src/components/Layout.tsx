import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { api } from "../lib/api";

const navItems = [
  { to: "/", label: "Sectors", icon: "📊" },
  { to: "/search", label: "Role Search", icon: "🔍" },
  { to: "/occupations", label: "Occupations", icon: "👥" },
  { to: "/drift", label: "Drift Analysis", icon: "📈" },
];

export function Layout() {
  const { data: datasets } = useApi(() => api.datasets(), []);
  const [collapsed, setCollapsed] = useState(false);

  const sidebarWidth = collapsed ? 64 : 260;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Sidebar */}
      <nav style={{
        width: sidebarWidth, minWidth: sidebarWidth, backgroundColor: "#18181B", color: "#fff",
        display: "flex", flexDirection: "column", padding: collapsed ? "24px 8px" : "24px 16px", gap: 4,
        transition: "all 0.2s ease",
        overflow: "hidden",
      }}>
        {/* Header + collapse toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed ? 16 : 2 }}>
          {!collapsed && <div style={{ fontSize: 18, fontWeight: 700 }}>SkillCurrent</div>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#71717A", fontSize: 18, padding: 4, borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              width: collapsed ? "100%" : "auto",
            }}
          >
            {collapsed ? "▶" : "◀"}
          </button>
        </div>

        {!collapsed && (
          <div style={{ fontSize: 12, color: "#71717A", marginBottom: 24 }}>Impact Analysis Platform</div>
        )}

        {!collapsed && (
          <div style={{ fontSize: 11, color: "#A1A1AA", fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
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
              display: "flex", alignItems: "center", gap: 8,
              padding: collapsed ? "10px 0" : "8px 12px",
              borderRadius: 8, textDecoration: "none",
              fontSize: collapsed ? 20 : 14,
              fontWeight: isActive ? 600 : 500,
              backgroundColor: isActive ? "#2563EB" : "transparent",
              color: isActive ? "#fff" : "#A1A1AA",
              justifyContent: collapsed ? "center" : "flex-start",
              transition: "all 0.2s ease",
            })}
          >
            <span>{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}

        {/* Data vintage at bottom */}
        {!collapsed && (
          <div style={{ marginTop: "auto", borderTop: "1px solid #27272A", paddingTop: 16 }}>
            <div style={{ fontSize: 11, color: "#71717A", fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
              DATA SOURCES
            </div>
            {datasets?.datasets.map((d) => (
              <div key={d.dataset_name} style={{ fontSize: 11, color: "#52525B", marginBottom: 2 }}>
                {d.dataset_name}: v{d.version_key}
              </div>
            ))}
            {datasets && (
              <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 8 }}>
                {datasets.total_rows.toLocaleString()} total rows
              </div>
            )}
          </div>
        )}

        {/* Collapsed: just show row count at bottom */}
        {collapsed && datasets && (
          <div style={{ marginTop: "auto", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#52525B", writingMode: "vertical-rl", transform: "rotate(180deg)", margin: "0 auto" }}>
              {datasets.total_rows.toLocaleString()} rows
            </div>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main style={{
        flex: 1, overflow: "auto", backgroundColor: "#FAFAFA",
        padding: 32,
      }}>
        <Outlet />
      </main>
    </div>
  );
}
