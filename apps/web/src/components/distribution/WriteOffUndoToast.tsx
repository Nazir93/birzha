type Props = {
  label: string;
  totalKg: number;
  undoing: boolean;
  onUndo: () => void;
  onDismiss: () => void;
};

export function WriteOffUndoToast({ label, totalKg, undoing, onUndo, onDismiss }: Props) {
  return (
    <div className="birzha-pwa-toast birzha-writeoff-undo-toast no-print" role="status" aria-live="polite">
      <p className="birzha-pwa-toast__text">
        Списано{" "}
        <strong>{totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг
        {label.trim() ? (
          <>
            {" "}
            — <span>{label}</span>
          </>
        ) : null}
        . Можно отменить.
      </p>
      <div className="birzha-pwa-toast__actions">
        <button type="button" className="birzha-btn-primary" disabled={undoing} onClick={onUndo}>
          {undoing ? "Отмена…" : "Отменить списание"}
        </button>
        <button type="button" className="birzha-btn-ghost" disabled={undoing} onClick={onDismiss}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
