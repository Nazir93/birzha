import { PRODUCT_GROUP_TOMATOES } from "./package-tare.js";

/** Рейс без товара — помидоры (как у исторических рейсов). */
export function effectiveTripProductGroup(productGroup: string | null | undefined): string {
  const trimmed = productGroup?.trim() ?? "";
  return trimmed || PRODUCT_GROUP_TOMATOES;
}

/**
 * Товар партии, который нельзя грузить на этот рейс.
 * Партия без товара не блокирует (старые данные). Разные товары — блок.
 */
export function conflictingBatchProduct(
  tripProductGroup: string | null | undefined,
  batchProductGroups: readonly (string | null | undefined)[],
): string | null {
  const tripProduct = effectiveTripProductGroup(tripProductGroup);
  for (const raw of batchProductGroups) {
    const batchProduct = raw?.trim() ?? "";
    if (!batchProduct || batchProduct === tripProduct) {
      continue;
    }
    return batchProduct;
  }
  return null;
}

export function tripProductMismatchMessage(tripProduct: string, batchProduct: string): string {
  return `На рейс «${tripProduct}» нельзя грузить «${batchProduct}». Выберите рейс того же товара.`;
}
