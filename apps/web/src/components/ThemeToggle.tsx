import { useBirzhaTheme } from "../theme/BirzhaThemeProvider.js";

function SunIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={4} stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Значок «тёмная тема» — залитый круг (читается как «чёрная» оформление). */
function DarkThemeDiskIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7.25" fill="currentColor" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.25" fill="none" opacity="0.28" />
    </svg>
  );
}

type ThemeToggleProps = {
  /** Компактная кнопка только с иконкой (шапка, узкие места). */
  variant?: "icon" | "labeled";
  className?: string;
};

/**
 * Переключатель светлой / тёмной темы. Состояние в `localStorage`, до первого выбора — `prefers-color-scheme`.
 *
 * `variant="labeled"` — в футере drawer: два значка (солнце · тёмный круг), подписи «Светлая»/«Тёмная» не показываются.
 */
export function ThemeToggle({ variant = "icon", className = "" }: ThemeToggleProps) {
  const { mode, setMode, toggleMode } = useBirzhaTheme();

  const label = mode === "dark" ? "Включить светлую тему" : "Включить тёмную тему";

  if (variant === "labeled") {
    return (
      <div
        className={`birzha-theme-toggle-group ${className}`.trim()}
        role="group"
        aria-label="Тема оформления: светлая или тёмная"
      >
        <button
          type="button"
          className={`birzha-theme-toggle birzha-theme-toggle-segment${mode === "light" ? " birzha-theme-toggle-segment--active" : ""}`}
          onClick={() => setMode("light")}
          aria-pressed={mode === "light"}
          aria-label="Светлая тема"
          title="Светлая тема"
        >
          <SunIcon />
        </button>
        <button
          type="button"
          className={`birzha-theme-toggle birzha-theme-toggle-segment${mode === "dark" ? " birzha-theme-toggle-segment--active" : ""}`}
          onClick={() => setMode("dark")}
          aria-pressed={mode === "dark"}
          aria-label="Тёмная тема"
          title="Тёмная тема"
        >
          <DarkThemeDiskIcon />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`birzha-theme-toggle birzha-theme-toggle--icon ${className}`.trim()}
      onClick={toggleMode}
      aria-label={label}
      title={label}
    >
      {mode === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
