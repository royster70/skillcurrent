/**
 * Audience-mode context (GitHub #86) — individual / organisation / education.
 *
 * Mirrors language.tsx exactly (a lens with no bookmarkable requirement, so the
 * context pattern, not region.ts's URL pattern). Quietly persisted in
 * localStorage; the default context value is a working individual-mode lexicon
 * so components render without a provider in tests.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  AUDIENCE_LEXICONS,
  DEFAULT_AUDIENCE,
  type AudienceLexicon,
  type AudienceMode,
} from "./audience-lexicon";

const STORAGE_KEY = "sc.audienceMode";

interface AudienceContextValue {
  mode: AudienceMode;
  setMode: (mode: AudienceMode) => void;
  aud: AudienceLexicon;
}

const AudienceContext = createContext<AudienceContextValue>({
  mode: DEFAULT_AUDIENCE,
  setMode: () => undefined,
  aud: AUDIENCE_LEXICONS[DEFAULT_AUDIENCE],
});

function readStoredMode(): AudienceMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "individual" || raw === "organisation" || raw === "education"
      ? raw
      : DEFAULT_AUDIENCE;
  } catch {
    return DEFAULT_AUDIENCE;
  }
}

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AudienceMode>(readStoredMode);

  const setMode = useCallback((next: AudienceMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the in-session choice still applies.
    }
  }, []);

  return (
    <AudienceContext.Provider value={{ mode, setMode, aud: AUDIENCE_LEXICONS[mode] }}>
      {children}
    </AudienceContext.Provider>
  );
}

export function useAudience(): AudienceContextValue {
  return useContext(AudienceContext);
}
