import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { persistBirzhaTheme, readEffectiveTheme, type BirzhaThemePreference } from "./birzha-theme.js";

type BirzhaThemeContextValue = {
  mode: BirzhaThemePreference;
  setMode: (next: BirzhaThemePreference) => void;
  toggleMode: () => void;
};

const BirzhaThemeContext = createContext<BirzhaThemeContextValue | null>(null);

export function BirzhaThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<BirzhaThemePreference>(() => readEffectiveTheme());

  const setMode = useCallback((next: BirzhaThemePreference) => {
    persistBirzhaTheme(next);
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);

  return <BirzhaThemeContext.Provider value={value}>{children}</BirzhaThemeContext.Provider>;
}

export function useBirzhaTheme(): BirzhaThemeContextValue {
  const ctx = useContext(BirzhaThemeContext);
  if (!ctx) {
    throw new Error("useBirzhaTheme must be used within BirzhaThemeProvider");
  }
  return ctx;
}
