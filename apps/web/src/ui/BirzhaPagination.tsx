import { btnClassInline } from "./styles.js";

export type BirzhaPaginationProps = {
  /** Номер страницы с нуля. */
  pageIndex: number;
  /** Число страниц (минимум 1). */
  pageCount: number;
  /** Подпись элемента для скринридеров, напр. «рейсов». */
  itemLabel?: string;
  onPageChange: (nextPageIndex: number) => void;
};

/**
 * Компактная пагинация: «Назад», номер страницы, «Вперёд».
 * Не рендерится при одной странице.
 */
export function BirzhaPagination({ pageIndex, pageCount, itemLabel, onPageChange }: BirzhaPaginationProps) {
  if (pageCount <= 1) {
    return null;
  }
  const safeIndex = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const label = itemLabel ? ` ${itemLabel}` : "";

  return (
    <nav
      className="birzha-pagination"
      aria-label={itemLabel ? `Страницы списка${label}` : "Страницы списка"}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.5rem 0.75rem",
        marginTop: "0.75rem",
      }}
    >
      <button
        type="button"
        className={btnClassInline}
        disabled={safeIndex <= 0}
        onClick={() => onPageChange(safeIndex - 1)}
      >
        Назад
      </button>
      <span style={{ fontSize: "0.88rem", color: "var(--color-muted)" }}>
        Страница {safeIndex + 1} из {pageCount}
      </span>
      <button
        type="button"
        className={btnClassInline}
        disabled={safeIndex >= pageCount - 1}
        onClick={() => onPageChange(safeIndex + 1)}
      >
        Вперёд
      </button>
    </nav>
  );
}
