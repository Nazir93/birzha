import type { DetailedHTMLProps, DetailsHTMLAttributes, ReactNode } from "react";

export type BirzhaDisclosureProps = {
  /** Содержимое строки заголовка (можно передать `<h3 id="…">`) */
  title: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  nested?: boolean;
  id?: string;
  className?: string;
  summaryClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/**
 * Раскрывающийся блок по мотивам списка погрузочных накладных: единый паттерн для кабинетов.
 */
export function BirzhaDisclosure({
  title,
  hint,
  defaultOpen = true,
  nested = false,
  id,
  className = "",
  summaryClassName,
  bodyClassName,
  children,
}: BirzhaDisclosureProps) {
  const rootClass = [
    "birzha-disclosure",
    nested ? "birzha-disclosure--nested" : "",
    className.trim() || null,
  ]
    .filter(Boolean)
    .join(" ");

  const detailsProps = {
    id,
    className: rootClass,
    defaultOpen,
  } as DetailedHTMLProps<DetailsHTMLAttributes<HTMLDetailsElement>, HTMLDetailsElement> & { defaultOpen?: boolean };

  return (
    <details {...detailsProps}>
      <summary className={summaryClassName ?? "birzha-disclosure__summary"}>
        {title}
        {hint != null && hint !== false ? <span className="birzha-disclosure__hint">{hint}</span> : null}
      </summary>
      <div className={bodyClassName ?? "birzha-disclosure__body"}>{children}</div>
    </details>
  );
}
