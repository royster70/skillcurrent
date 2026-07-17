/**
 * Language-mode context (GitHub #79) — plain vs nautical vocabulary.
 *
 * Quiet persistence: the choice lives in localStorage (same pattern the
 * region picker uses, GitHub #74); "plain" is the default for first-time
 * visitors. The context carries the resolved Lexicon so consumers write
 * `lex.zoneLabels[z]` instead of importing label maps directly.
 *
 * The default context value is a working plain-mode lexicon, so components
 * render correctly in tests without a provider wrapper.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { DEFAULT_MODE, LEXICONS, type LanguageMode, type Lexicon } from "./lexicon";

const STORAGE_KEY = "sc.languageMode";

interface LanguageContextValue {
  mode: LanguageMode;
  setMode: (mode: LanguageMode) => void;
  lex: Lexicon;
}

const LanguageContext = createContext<LanguageContextValue>({
  mode: DEFAULT_MODE,
  setMode: () => undefined,
  lex: LEXICONS[DEFAULT_MODE],
});

function readStoredMode(): LanguageMode {
  // try/catch: localStorage throws in some private/embedded contexts.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "plain" || raw === "nautical" ? raw : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LanguageMode>(readStoredMode);

  const setMode = useCallback((next: LanguageMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the in-session choice still applies.
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ mode, setMode, lex: LEXICONS[mode] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
