/** CurrentFlow — the flowing-streamline device of "the Current".
 *
 * A small SVG of animated streamlines used across the app for wayfinding:
 * guiding the eye down a page, confirming a hover, or (via `bearing`) bending
 * toward the option a user is considering. See motion.ts for the app-wide
 * bearing convention. Reduced-motion renders the streams as static lines.
 */

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { THEME } from "../../lib/constants";
import { DUR, EASE, ensureMotionStyles, prefersReducedMotion } from "./motion";

/** Play animations only while on screen — off-screen currents pause, so the
 * page never runs more than a viewport's worth of motion at once. */
function useInViewPlayState<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPlaying(true);
      return;
    }
    const obs = new IntersectionObserver(([entry]) => setPlaying(entry.isIntersecting), {
      threshold: 0.05,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, playing };
}

interface CurrentFlowProps {
  /** Flow axis. `down` guides scroll; `right` underlines/points forward. */
  direction?: "down" | "right";
  /** Size along the flow axis (px). */
  length?: number;
  /** Size across the flow axis (px). */
  breadth?: number;
  /** Number of parallel streamlines. */
  strokes?: number;
  color?: string;
  opacity?: number;
  /** Seconds per flow cycle. */
  speed?: number;
  /** Degrees to bend the current toward (negative = left). Transitions smoothly. */
  bearing?: number;
  style?: CSSProperties;
}

/** One curving streamline path along the flow axis. */
function streamPath(direction: "down" | "right", pos: number, len: number, amp: number): string {
  if (direction === "down") {
    return (
      `M${pos},-10 ` +
      `C${pos - amp},${len * 0.25} ${pos + amp},${len * 0.55} ${pos},${len * 0.8} ` +
      `S${pos - amp * 0.7},${len * 1.1} ${pos},${len + 10}`
    );
  }
  return (
    `M-10,${pos} ` +
    `C${len * 0.25},${pos - amp} ${len * 0.55},${pos + amp} ${len * 0.8},${pos} ` +
    `S${len * 1.1},${pos - amp * 0.7} ${len + 10},${pos}`
  );
}

export function CurrentFlow({
  direction = "down",
  length = 120,
  breadth = 120,
  strokes = 3,
  color,
  opacity = 0.35,
  speed = 3.4,
  bearing = 0,
  style,
}: CurrentFlowProps) {
  ensureMotionStyles();
  const t = THEME.light;
  const stroke = color ?? t.current; // motion = the water/wind hue, not the brass instrument
  const { ref, playing } = useInViewPlayState<HTMLDivElement>();

  const w = direction === "down" ? breadth : length;
  const h = direction === "down" ? length : breadth;
  const amp = Math.max(6, breadth * 0.09);
  const positions = Array.from({ length: strokes }, (_, i) => ((i + 1) * breadth) / (strokes + 1));

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        display: "inline-block",
        lineHeight: 0,
        transform: `rotate(${bearing}deg)`,
        transformOrigin: direction === "down" ? "50% 0%" : "0% 50%",
        transition: `transform ${DUR.bearing}ms ${EASE}`,
        ...style,
      }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {positions.map((pos, i) => (
          <path
            key={i}
            className="sc-stream"
            d={streamPath(direction, pos, direction === "down" ? h : w, amp)}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={opacity}
            style={{
              animationDelay: `${i * 0.6}s`,
              animationPlayState: playing ? "running" : "paused",
              ["--sc-speed" as string]: `${speed}s`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

interface BackgroundCurrentProps {
  /** Flow axis. `right` reads as forward / "where it's heading" (the default for
   * ambient mood); `down` guides scroll. */
  direction?: "down" | "right";
  /** Number of parallel streamlines. */
  strokes?: number;
  color?: string;
  opacity?: number;
  /** Seconds per flow cycle. */
  speed?: number;
  /** Small dots travelling along each streamline — the strongest "this is a
   * current, not a static line" signal. Off automatically under
   * prefers-reduced-motion. */
  particles?: boolean;
  style?: CSSProperties;
}

/** The river: a full-bleed, continuous current that runs behind an entire
 * page section (absolutely positioned, CSS-sized to 100% of its relatively-
 * positioned parent — the parent's natural content height sets how tall it
 * runs). Distinct from `CurrentFlow`, which is icon-scale and used for local
 * accents (hover, the wordmark underline). This is the "the whole page is one
 * current" statement piece — it should be felt, not just noticed. */
export function BackgroundCurrent({
  direction = "down",
  strokes = 4,
  color,
  opacity = 0.22,
  speed = 5,
  particles = true,
  style,
}: BackgroundCurrentProps) {
  ensureMotionStyles();
  const t = THEME.light;
  const stroke = color ?? t.current;
  const { ref, playing } = useInViewPlayState<HTMLDivElement>();
  const reduced = prefersReducedMotion();
  const idPrefix = useId();

  // A virtual canvas stretched via CSS (preserveAspectRatio="none") to fill the
  // parent. `right` = streamlines run across the width (forward); `down` = a
  // vertical river. `across` distributes the strokes on the perpendicular axis;
  // `len` is the flow-axis length; amp is gentler horizontally (it stretches).
  const horizontal = direction === "right";
  const W = horizontal ? 1200 : 320;
  const H = horizontal ? 360 : 1200;
  const amp = horizontal ? 14 : 34;
  const across = horizontal ? H : W;
  const len = horizontal ? W : H;
  const positions = Array.from({ length: strokes }, (_, i) => ((i + 1) * across) / (strokes + 1));

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        ...style,
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {positions.map((pos, i) => {
          const d = streamPath(direction, pos, len, amp);
          const pathId = `${idPrefix}-stream-${i}`;
          return (
            <g key={i}>
              <path
                id={pathId}
                className="sc-stream"
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={opacity}
                style={{
                  animationDelay: `${i * 0.8}s`,
                  animationPlayState: playing ? "running" : "paused",
                  ["--sc-speed" as string]: `${speed}s`,
                }}
              />
              {particles && !reduced && (
                <circle r={4} fill={stroke} opacity={Math.min(1, opacity + 0.35)}>
                  <animateMotion
                    dur={`${speed * 1.7}s`}
                    repeatCount="indefinite"
                    begin={`${i * 0.9}s`}
                    rotate="auto"
                  >
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A gently flowing brass underline (the wordmark's waterline). */
export function WaveUnderline({ color, style }: { color?: string; style?: CSSProperties }) {
  ensureMotionStyles();
  // The brass wordmark sits on the water it reads: the underline is the current hue.
  const stroke = color ?? THEME.light.current;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 80 6"
      preserveAspectRatio="none"
      style={{ position: "absolute", left: 0, bottom: -4, width: "100%", height: 6, ...style }}
    >
      <path
        className="sc-stream"
        d="M0,3 C13,1 26,5 40,3 S66,1 80,3"
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.7}
        style={{ ["--sc-speed" as string]: "4.2s" }}
      />
    </svg>
  );
}
