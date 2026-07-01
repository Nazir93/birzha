import type { LoadingManifestDetail } from "../api/types.js";

export type LoadingManifestTripAssignLockCode = "already_assigned" | "already_shipped" | "no_stock";

export function loadingManifestTripAssignLockMessage(code: LoadingManifestTripAssignLockCode): string {
  switch (code) {
    case "already_assigned":
      return "Смена или отвязка от рейса недоступны — по партиям уже есть продажи, недостачи или рейс закрыт.";
    case "already_shipped":
      return "Масса по партиям уже отгружена в рейс — привязка накладной недоступна.";
    case "no_stock":
      return "На складе по партиям этой накладной нет остатка — привязка недоступна.";
    default:
      return "Привязка к рейсу недоступна.";
  }
}

/** Состояние блокировки из API; для старых ответов — только по tripId. */
export function loadingManifestTripAssignLockFromDetail(
  detail: LoadingManifestDetail,
): { locked: boolean; code?: LoadingManifestTripAssignLockCode } {
  if (detail.tripAssignLocked === true) {
    const code = detail.tripAssignLockedReason;
    if (code === "already_assigned" || code === "already_shipped" || code === "no_stock") {
      return { locked: true, code };
    }
    return { locked: true, code: "already_assigned" };
  }
  if (detail.tripAssignLocked === false) {
    return { locked: false };
  }
  if (detail.tripId?.trim()) {
    return { locked: true, code: "already_assigned" };
  }
  return { locked: false };
}
