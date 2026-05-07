import { useState, type CSSProperties, type ReactNode } from "react";

export type BirzhaDisclosureProps = {
  /** Содержимое строки заголовка (можно передать `<h3 id="…">`) */
  title: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  /** Вместе с `onOpenChange` — контролируемое открытие (например массовое «развернуть все»). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  nested?: boolean;
  id?: string;
  className?: string;
  summaryClassName?: string;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  children: ReactNode;
};

/**
 * Раскрывающийся блок по мотивам списка погрузочных накладных: единый паттерн для кабинетов.
 */
export function BirzhaDisclosure({
  title,
  hint,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  nested = false,
  id,
  className = "",
  summaryClassName,
  bodyClassName,
  bodyStyle,
  children,
}: BirzhaDisclosureProps) {
  const controlled = openProp !== undefined && onOpenChange != null;
  const [openUncontrolled, setOpenUncontrolled] = useState(defaultOpen);
  const open = controlled ? openProp : openUncontrolled;

  const rootClass = [
    "birzha-disclosure",
    nested ? "birzha-disclosure--nested" : "",
    className.trim() || null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <details
      id={id}
      className={rootClass}
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (controlled) {
          onOpenChange(next);
        } else {
          setOpenUncontrolled(next);
        }
      }}
    >
      <summary className={summaryClassName ?? "birzha-disclosure__summary"}>
        {title}
        {hint != null && hint !== false ? <span className="birzha-disclosure__hint">{hint}</span> : null}
      </summary>
      <div className={bodyClassName ?? "birzha-disclosure__body"} style={bodyStyle}>
        {children}
      </div>
    </details>
  );
}
