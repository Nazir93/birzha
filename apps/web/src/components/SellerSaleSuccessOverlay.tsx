import { useEffect } from "react";
import { createPortal } from "react-dom";

import { btnStyle } from "../ui/styles.js";

export type SellerSaleFlashData = {
  kg: string;
  packages: string | null;
  sumRub: string;
  productLine: string;
  paymentLabel?: string | null;
  clientLabel?: string | null;
};

type Props = {
  data: SellerSaleFlashData;
  onDismiss: () => void;
};

/** Полноэкранное подтверждение продажи для кабинета продавца. */
export function SellerSaleSuccessOverlay({ data, onDismiss }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  return createPortal(
    <div className="birzha-sold-overlay" role="presentation">
      <button
        type="button"
        className="birzha-sold-overlay__backdrop"
        aria-label="Закрыть"
        onClick={onDismiss}
      />
      <div
        className="birzha-sold-overlay__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="birzha-sold-overlay-title"
        aria-describedby="birzha-sold-overlay-desc"
      >
        <div className="birzha-sold-overlay__glow" aria-hidden />
        <div className="birzha-sold-overlay__icon" aria-hidden>
          ✓
        </div>
        <p className="birzha-sold-overlay__eyebrow">Сделка сохранена</p>
        <h2 id="birzha-sold-overlay-title" className="birzha-sold-overlay__title">
          Продано
        </h2>
        <p id="birzha-sold-overlay-desc" className="birzha-sold-overlay__lead">
          <strong>{data.productLine}</strong>
          <span className="birzha-sold-overlay__dot">·</span>
          <span>{data.kg} кг</span>
          {data.packages ? (
            <>
              <span className="birzha-sold-overlay__dot">·</span>
              <span>{data.packages} ящ</span>
            </>
          ) : null}
        </p>
        <p className="birzha-sold-overlay__sum">
          Сумма <strong>{data.sumRub} ₽</strong>
          {data.paymentLabel ? (
            <>
              <span className="birzha-sold-overlay__dot">·</span>
              <span>{data.paymentLabel}</span>
            </>
          ) : null}
        </p>
        {data.clientLabel ? (
          <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 1rem" }}>
            {data.clientLabel}
          </p>
        ) : null}
        <button type="button" className="birzha-sold-overlay__btn" style={btnStyle} onClick={onDismiss}>
          Продолжить
        </button>
      </div>
    </div>,
    document.body,
  );
}
