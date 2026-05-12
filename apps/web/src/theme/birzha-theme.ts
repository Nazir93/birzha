const STORAGE_KEY = "birzha-theme";

export type BirzhaThemePreference = "light" | "dark";

/** Вызывать до первого paint (из main.tsx), чтобы не мигал фон. */
export function syncBirzhaThemeFromStorage(): void {
  if (typeof document === "undefined") {
    return;
  }
  const effective = readEffectiveTheme();
  applyBirzhaThemeToDocument(effective);
}

function readStored(): BirzhaThemePreference | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function systemIsDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readEffectiveTheme(): BirzhaThemePreference {
  const stored = readStored();
  if (stored !== null) {
    return stored;
  }
  return systemIsDark() ? "dark" : "light";
}

export function applyBirzhaThemeToDocument(mode: BirzhaThemePreference): void {
  document.documentElement.dataset.birzhaTheme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", mode === "dark" ? "#18181b" : "#f4f4f5");
  }
}

export function persistBirzhaTheme(mode: BirzhaThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  applyBirzhaThemeToDocument(mode);
}
