/**
 * useHashScroll — land hash deep-links (e.g. /methodology#the-formula)
 * scrolled to their section after SPA navigation, which react-router does
 * not do natively.
 *
 * Deferred past first paint via double-rAF so a freshly-mounted (and
 * async-growing) page has laid out before we measure the target. Instant
 * under prefers-reduced-motion. Extracted from LandingPage so every
 * deep-link destination (landing, methodology) shares one implementation.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { prefersReducedMotion } from "../components/current/motion";

export function useHashScroll(): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [hash]);
}
