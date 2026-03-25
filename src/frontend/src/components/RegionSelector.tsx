/**
 * RegionSelector — US/AU toggle for switching between NAICS and ANZSIC sector views.
 *
 * Stores selection in URL search params (?region=AU) for bookmarkability.
 * Defaults to US when no param is set.
 */

interface Props {
  region: string;
  onChange: (region: string) => void;
}

const REGIONS = [
  { code: "US", label: "United States", flag: "\uD83C\uDDFA\uD83C\uDDF8", system: "NAICS" },
  { code: "AU", label: "Australia", flag: "\uD83C\uDDE6\uD83C\uDDFA", system: "ANZSIC" },
];

export function RegionSelector({ region, onChange }: Props) {
  return (
    <div style={{
      display: "inline-flex",
      gap: 0,
      borderRadius: 8,
      border: "1.5px solid #E4E4E7",
      overflow: "hidden",
      backgroundColor: "#FAFAFA",
    }}>
      {REGIONS.map((r) => {
        const active = region === r.code;
        return (
          <button
            key={r.code}
            onClick={() => onChange(r.code)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              fontFamily: "Inter, system-ui, sans-serif",
              color: active ? "#18181B" : "#71717A",
              backgroundColor: active ? "#FFFFFF" : "transparent",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              borderRight: r.code === "US" ? "1px solid #E4E4E7" : "none",
              transition: "all 0.15s ease",
            }}
            title={`${r.label} (${r.system} sectors)`}
          >
            <span style={{ fontSize: 16 }}>{r.flag}</span>
            <span>{r.code}</span>
          </button>
        );
      })}
    </div>
  );
}
