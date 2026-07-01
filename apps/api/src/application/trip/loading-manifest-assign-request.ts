export type LoadingManifestAssignRequestDecision =
  | "proceed"
  | "idempotent"
  | "change_forbidden"
  | "change_allowed";

/**
 * Решение для повторной привязки ПН:
 * - та же привязка к тому же рейсу => идемпотентный success;
 * - смена рейса => change_allowed, если canChangeTrip (нет продаж/недостач);
 * - иначе change_forbidden;
 * - если ПН ещё без рейса => proceed.
 */
export function classifyLoadingManifestAssignRequest(input: {
  existingTripId: string | null | undefined;
  requestedTripId: string;
  canChangeTrip?: boolean;
}): LoadingManifestAssignRequestDecision {
  const existing = input.existingTripId?.trim() ?? "";
  const requested = input.requestedTripId.trim();
  if (!existing) {
    return "proceed";
  }
  if (existing === requested) {
    return "idempotent";
  }
  return input.canChangeTrip ? "change_allowed" : "change_forbidden";
}
