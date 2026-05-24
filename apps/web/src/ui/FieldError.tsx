import { ErrorAlert } from "./ErrorAlerts.js";

/** Сообщение об ошибке формы или запроса — адаптивный блок. */
export function FieldError({
  error,
  title,
}: {
  error: Error | null;
  title?: string;
}) {
  return <ErrorAlert error={error} title={title} />;
}
