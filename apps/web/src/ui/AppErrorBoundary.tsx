import { Component, type ErrorInfo, type ReactNode } from "react";

import { humanizeErrorMessage } from "../format/user-facing-error.js";

import { BirzhaAlert } from "./BirzhaAlert.js";
import { btnStyle } from "./styles.js";

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
        <div className="birzha-error-boundary-wrap">
          <BirzhaAlert variant="error" title="Сбой интерфейса">
            <p style={{ margin: "0 0 0.65rem" }}>
              Произошла непредвиденная ошибка при отображении страницы. Данные на сервере могли не пострадать.
            </p>
            <p style={{ margin: 0, opacity: 0.9 }}>{humanizeErrorMessage(error)}</p>
          </BirzhaAlert>
          <div className="birzha-error-boundary-actions">
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
