/** Имя события: глобальная ошибка мутации (см. `MutationErrorBanner`, `createWebQueryClient`). */
export const BIRZHA_MUTATION_ERROR_EVENT = "birzha-mutation-error";

export type BirzhaMutationErrorDetail = { message: string };

export function formatMutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return String(error);
}

export function emitMutationError(error: unknown): void {
  const message = formatMutationErrorMessage(error);
  if (message.trim() === "") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(BIRZHA_MUTATION_ERROR_EVENT, {
      detail: { message } satisfies BirzhaMutationErrorDetail,
    }),
  );
}
