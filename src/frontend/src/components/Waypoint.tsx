/**
 * Waypoint — the app's mono/brass section eyebrow ("nautical wayfinding").
 *
 * Canonical sizing was set in the landing redesign (phase 3.17): 14/600/2.5,
 * sat just under the hero's FOLLOW THE CURRENT CTA. One home so that decision
 * propagates across the landing, Rising Tide, and Search rather than drifting
 * into three hand-tuned sizes.
 */

import type { ReactNode } from "react";
import { THEME, TYPE } from "../lib/constants";

const t = THEME.light;

export function Waypoint({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <div
      style={{
        fontFamily: TYPE.mono,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: 2.5,
        color: t.brass,
        textAlign: center ? "center" : "left",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}
