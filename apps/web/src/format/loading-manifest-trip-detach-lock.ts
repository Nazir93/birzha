export type LoadingManifestTripDetachLockCode =
  | "not_linked"
  | "trip_closed"
  | "sales_or_shortage"
  | "shipment_mismatch";

export function loadingManifestTripDetachLockMessage(code: LoadingManifestTripDetachLockCode): string {
  switch (code) {
    case "not_linked":
      return "Погрузочная накладная не привязана к рейсу.";
    case "trip_closed":
      return "Рейс закрыт — отвязать погрузочную накладную нельзя.";
    case "sales_or_shortage":
      return "По рейсу уже есть продажи или недостачи по партиям этой накладной — отвязка недоступна.";
    case "shipment_mismatch":
      return "Масса по накладной не совпадает с отгрузкой в рейс — отвязка недоступна. Обратитесь к администратору.";
    default:
      return "Отвязка от рейса недоступна.";
  }
}
