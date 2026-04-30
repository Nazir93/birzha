import { errorText } from "./styles.js";

/** Однострочное сообщение об ошибке формы (без секретов в тексте). */
export function FieldError({ error }: { error: Error | null }) {
  if (!error) {
    return null;
  }
  return (
    <p role="alert" style={errorText}>
      {error.message}
    </p>
  );
}
