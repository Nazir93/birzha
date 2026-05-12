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

type ThemeToggleProps = {
  /** Компактная кнопка только с иконкой (шапка, узкие места). */
  variant?: "icon" | "labeled";
  className?: string;
};

/**
 * Переключатель светлой / тёмной темы. Состояние в `localStorage`, до первого выбора — `prefers-color-scheme`.
 */
export function ThemeToggle({ variant = "icon", className = "" }: ThemeToggleProps) {
  const { mode, toggleMode } = useBirzhaTheme();

  const label = mode === "dark" ? "Включить светлую тему" : "Включить тёмную тему";

  if (variant === "labeled") {
    return (
      <button
        type="button"
        className={`birzha-theme-toggle birzha-theme-toggle--labeled ${className}`.trim()}
        onClick={toggleMode}
        aria-label={label}
      >
        {mode === "dark" ? <SunIcon /> : <MoonIcon />}
        <span className="birzha-theme-toggle__text">{mode === "dark" ? "Светлая" : "Тёмная"}</span>
      </button>
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
