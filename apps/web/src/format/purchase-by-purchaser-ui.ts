/**
 * Секции отчёта «закупки по закупщикам».
 * У scoped purchaser «По складам» уже = разрез по складу — «Итого по складам» не показываем.
 */
export function showPurchaseByPurchaserWarehouseTotals(purchaserScoped: boolean): boolean {
  return !purchaserScoped;
}
