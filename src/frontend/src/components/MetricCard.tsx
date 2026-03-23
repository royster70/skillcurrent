interface MetricCardProps {
  label: string;
  value: string;
  subtitle: string;
  color: string;
  bgColor?: string;
  borderColor?: string;
}

export function MetricCard({ label, value, subtitle, color, bgColor, borderColor }: MetricCardProps) {
  return (
    <div style={{
      flex: 1, padding: 20, borderRadius: 12, gap: 4, display: "flex", flexDirection: "column",
      border: `1.5px solid ${borderColor || "#E4E4E7"}`,
      backgroundColor: bgColor || "#fff",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: "#A1A1AA" }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#71717A" }}>{subtitle}</div>
    </div>
  );
}
