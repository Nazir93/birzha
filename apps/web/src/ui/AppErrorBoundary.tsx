import { Component, type ErrorInfo, type ReactNode } from "react";

import { btnStyle, errorText } from "./styles.js";

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Ловит ошибки рендера в дереве ниже (lazy-импорты, баги в панелях). Не заменяет обработку ошибок API.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[AppErrorBoundary]", error, info.componentStack);
    }
  }

  private clear = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div
          role="alert"
          style={{
            maxWidth: "36rem",
            margin: "2rem auto",
            padding: "1.25rem 1.5rem",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--birzha-radius)",
            background: "var(--birzha-surface)",
            boxShadow: "var(--birzha-shadow-sm)",
            fontFamily: "var(--font-ui, system-ui, sans-serif)",
          }}
        >
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.15rem" }}>Сбой интерфейса</h1>
          <p style={{ ...errorText, margin: "0 0 0.75rem" }}>
            Произошла непредвиденная ошибка при отображении страницы. Данные на сервере могли не пострадать — это сбой
            только в браузере.
          </p>
          <p
            className="birzha-callout-warning"
            style={{
              margin: "0 0 1rem",
              fontSize: "0.82rem",
              wordBreak: "break-word",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            }}
          >
            {error.message}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button type="button" style={btnStyle} onClick={() => window.location.reload()}>
              Обновить страницу
            </button>
            <button type="button" style={btnStyle} onClick={this.clear}>
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
