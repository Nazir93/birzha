import type { TripSaleLineJson } from "../api/types.js";

import { inferPaymentKindFromSaleLine, kopecksPerKgToRubDecimalString } from "./trip-sale-line-payment.js";
import { kopecksToRubLabel } from "./money.js";

const PAYMENT_LABEL: Record<ReturnType<typeof inferPaymentKindFromSaleLine>, string> = {
  cash: "Наличные",
  debt: "В долг",
  mixed: "Смешанная",
  card_transfer: "Перевод на карту",
};

/** Подпись способа оплаты для журнала продаж. */
export function formatTripSaleLinePaymentLabel(line: TripSaleLineJson): string {
  const kind = inferPaymentKindFromSaleLine(line);
  const base = PAYMENT_LABEL[kind];
  if (kind === "mixed") {
    return `${base}: нал ${kopecksToRubLabel(line.cashKopecks)} ₽, долг ${kopecksToRubLabel(line.debtKopecks)} ₽`;
  }
  if (kind === "card_transfer") {
    return `${base}: ${kopecksToRubLabel(line.cardTransferKopecks)} ₽`;
  }
  return base;
}

/** Строка «кг · цена · ящики · оптовик» в списке исправления продаж. */
export function formatSellerCorrectionSaleMeta(line: TripSaleLineJson): string {
  const parts: string[] = [`${line.kg} кг`, `${kopecksPerKgToRubDecimalString(line.pricePerKgKopecks)} ₽/кг`];
  if (line.packageCount) {
    parts.push(`${line.packageCount} ящ`);
  }
  if (line.saleChannel === "wholesale") {
    const name = line.clientLabel?.trim();
    parts.push(name ? `Опт: ${name}` : "Опт");
  }
  return parts.join(" · ");
}
