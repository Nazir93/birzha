import type { TripSaleLineJson } from "../api/types.js";

import { kopecksPerKgToRubDecimalString } from "./trip-sale-line-payment.js";

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
