/** Nav icons — minimal instrument line-art, replacing the emoji set.
 *
 * Monochrome, `currentColor`-based (they inherit the nav item's ink/brass
 * state automatically) — no separate active-color wiring needed. Consistent
 * 22x22 viewBox, 1.6 stroke, round caps: reads as a drawn instrument mark,
 * matching the wireframe kit's aesthetic rather than a colourful glyph.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(props: IconProps) {
  const { size = 18, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 22 22",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

/** Waterline — a horizon crossing a bounded scope: the platform's flagship mark. */
export function IconWaterline(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="8" />
      <path d="M3.5 11c1.4-1.6 2.6-1.6 4-.4s2.6 1.2 4-.4 2.6-1.6 4-.4 2.6 1.2 3-.2" />
    </svg>
  );
}

/** Sectors — ascending soundings (bar chart, drawn as depth marks). */
export function IconSectors(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 17V9" />
      <path d="M11 17V5" />
      <path d="M17 17v-5" />
      <path d="M3.5 17.5h15" />
    </svg>
  );
}

/** Role Search — a sextant-like sighting glass. */
export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9.5" cy="9.5" r="6" />
      <path d="M14 14l4.5 4.5" />
    </svg>
  );
}

/** Occupations — a single figure, kept singular and quiet. */
export function IconOccupations(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="6.5" r="3" />
      <path d="M4.5 18c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5" />
    </svg>
  );
}

/** Drift Analysis — a heading line breaking away, arrow forward. */
export function IconDrift(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 14l4.5-4 3.5 3 6-6.5" />
      <path d="M13.5 6h3.5v3.5" />
    </svg>
  );
}

/** Anchor — the "how this works" / methodology mark. */
export function IconAnchor(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="4.8" r="1.8" />
      <path d="M11 6.6V17" />
      <path d="M6.5 12c0 3 2 5 4.5 5s4.5-2 4.5-5" />
      <path d="M8 9h6" />
    </svg>
  );
}

/** Compass — semantic search: reads meaning the way a compass reads a bearing. */
export function IconCompass(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="8" />
      <path d="M11 6.5l2 4.5-2 4.5-2-4.5z" />
    </svg>
  );
}

/** Text lines — literal text matching. */
export function IconTextLines(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 7h12" />
      <path d="M5 11h9" />
      <path d="M5 15h12" />
    </svg>
  );
}

/** Info — a plain circled "i", used for explainer/education toggles. */
export function IconInfo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="8" />
      <line x1="11" y1="15" x2="11" y2="10.5" />
      <line x1="11" y1="7.2" x2="11.01" y2="7.2" />
    </svg>
  );
}

/** Chevron — expand/collapse indicator. */
export function IconChevron(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polyline points="6 9 11 14 16 9" />
    </svg>
  );
}

/** Open book — the "what's the data" / sources mark. */
export function IconSources(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M11 6.5c-1.5-1.4-3.6-2-6-2v11c2.4 0 4.5.6 6 2 1.5-1.4 3.6-2 6-2v-11c-2.4 0-4.5.6-6 2z" />
      <path d="M11 6.5V17.5" />
    </svg>
  );
}
