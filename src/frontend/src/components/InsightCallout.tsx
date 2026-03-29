/**
 * InsightCallout — reusable educational callout component.
 *
 * Orange-tinted container with lightbulb icon.
 * Used to explain context on sector detail pages.
 */

import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

export function InsightCallout({ title, children }: Props) {
  return (
    <div style={{
      borderRadius: 12,
      border: "1.5px solid #FDBA74",
      backgroundColor: "#FFF7ED",
      padding: "14px 20px",
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.663 17h4.674M12 3v1M6.343 7.343l-.707-.707M3 13h1M20 13h1M18.364 7.343l.707-.707" />
          <path d="M16 13a4 4 0 1 0-5.995 3.465.5.5 0 0 1 .245.435v.1a1 1 0 0 0 1 1h1.5a1 1 0 0 0 1-1v-.1a.5.5 0 0 1 .245-.435A4 4 0 0 0 16 13Z" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#C2410C", fontFamily: "Inter, system-ui, sans-serif" }}>
          {title}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.6, fontFamily: "Inter, system-ui, sans-serif" }}>
        {children}
      </div>
    </div>
  );
}
