/** Shared motion constants for "the Current" — the app's one motion system.
 *
 * Brand rule (brand brief §9): motion serves WAYFINDING, never spectacle —
 * it carries data (water rising), guides the eye (streamlines), or confirms
 * an affordance (hover). Everything collapses under prefers-reduced-motion.
 *
 * Bearing convention (used app-wide as phases land): any selection that shifts
 * the view left / right / up / down sets the local current's `bearing` to match
 * the shift's direction — negative degrees bend left, positive bend right.
 * Examples: region toggle US⇄AU, era scrub back/forward, zone filters, or a
 * choice among side-by-side options (hovering the left card bends the current
 * left). The current is the app's consistent "which way are we moving" signal.
 */

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/** Durations (ms). */
export const DUR = {
  reveal: 700, // scroll-reveal fade/rise
  rise: 700, // waterline-bar fill
  bearing: 400, // current re-aiming after a user decision
  hover: 150, // affordance confirmations
} as const;

/** One easing for the whole system — gentle water, no bounce. */
export const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/** Inject the shared keyframes once (idempotent). */
export function ensureMotionStyles(): void {
  if (typeof document === "undefined" || document.getElementById("sc-motion")) return;
  const el = document.createElement("style");
  el.id = "sc-motion";
  el.textContent = `
@keyframes sc-flow { to { stroke-dashoffset: -240; } }
.sc-stream {
  stroke-dasharray: 12 228;
  animation: sc-flow var(--sc-speed, 3.4s) linear infinite;
}
@keyframes sc-fade-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media ${REDUCED_MOTION_QUERY} {
  .sc-stream { animation: none; stroke-dasharray: none; }
}
`;
  document.head.appendChild(el);
}
