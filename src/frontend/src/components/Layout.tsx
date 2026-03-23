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

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Sidebar */}
      <nav style={{
        width: 260, minWidth: 260, backgroundColor: "#18181B", color: "#fff",
        display: "flex", flexDirection: "column", padding: "24px 16px", gap: 4,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>Workforce AI</div>
        <div style={{ fontSize: 12, color: "#71717A", marginBottom: 24 }}>Impact Analysis Platform</div>

        <div style={{ fontSize: 11, color: "#A1A1AA", fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
          INDUSTRY INTELLIGENCE
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", borderRadius: 8, textDecoration: "none",
              fontSize: 14, fontWeight: isActive ? 600 : 500,
              backgroundColor: isActive ? "#2563EB" : "transparent",
              color: isActive ? "#fff" : "#A1A1AA",
            })}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {/* Data vintage at bottom */}
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
