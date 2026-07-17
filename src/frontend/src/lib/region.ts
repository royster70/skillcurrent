/**
 * Region selection with quiet persistence (GitHub #74).
 *
 * Precedence when READING: URL `?region=` wins > localStorage `sc.region` >
 * "US". The URL stays the bookmarkable source of truth (why region was
 * URL-borne originally — RegionSelector docstring); localStorage only fills
 * in when the URL says nothing, so an AU visitor who picked their market
 * once lands on AU data next visit without a modal.
 *
 * Reading NEVER writes the URL. `setRegion` persists to localStorage and
 * syncs the URL param (merge, not replace — composite pages carry ?codes=)
 * so the address bar always reflects what the page shows.
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export type Region = "US" | "AU";

const STORAGE_KEY = "sc.region";

function readStoredRegion(): Region | null {
  // try/catch: localStorage throws in some private/embedded contexts.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "US" || raw === "AU" ? raw : null;
  } catch {
    return null;
  }
}

/** Resolve a raw ?region= value: anything other than AU reads as US. */
function parseRegion(raw: string | null): Region | null {
  if (raw == null) return null;
  return raw.toUpperCase() === "AU" ? "AU" : "US";
}

export function useRegion(): { region: Region; setRegion: (r: Region) => void } {
  const [searchParams, setSearchParams] = useSearchParams();

  const region: Region = parseRegion(searchParams.get("region")) ?? readStoredRegion() ?? "US";

  const setRegion = useCallback(
    (r: Region) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, r);
      } catch {
        // Persistence is best-effort; the URL still carries the choice.
      }
      // Merge into existing params (composite pages carry ?codes=&company=);
      // US is the default and is expressed by REMOVING the param.
      const next = new URLSearchParams(searchParams);
      if (r === "US") next.delete("region");
      else next.set("region", r);
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  return { region, setRegion };
}
