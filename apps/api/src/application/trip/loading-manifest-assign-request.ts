export type LoadingManifestAssignRequestDecision = "proceed" | "idempotent" | "change_forbidden";

/**
 * Решение для повторной привязки ПН:
 * - та же привязка к тому же рейсу => идемпотентный success;
 * - попытка сменить уже привязанный рейс => запрет;
 * - если ПН ещё без рейса => можно продолжать обычную проверку.
 */
export function classifyLoadingManifestAssignRequest(input: {
  existingTripId: string | null | undefined;
  requestedTripId: string;
}): LoadingManifestAssignRequestDecision {
  const existing = input.existingTripId?.trim() ?? "";
  const requested = input.requestedTripId.trim();
  if (!existing) {
    return "proceed";
  }
  if (existing === requested) {
    return "idempotent";
  }
  return "change_forbidden";
}
