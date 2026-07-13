export type RecentWriteOffRow = {
  writeOffId: string;
  kg: number;
  label: string;
};

type Props = {
  rows: RecentWriteOffRow[];
  undoingWriteOffId: string | null;
  onUndo: (writeOffId: string) => void;
};

export function WriteOffRecentList({ rows, undoingWriteOffId, onUndo }: Props) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="birzha-writeoff-recent no-print" style={{ marginTop: "0.75rem" }}>
      <h5 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 0.4rem" }}>Недавние возвраты</h5>
      <div className="birzha-table-scroll birzha-nakl-lines-card">
        <table className="birzha-data-table birzha-data-table--compact" aria-label="Недавние возвраты на склад">
          <thead>
            <tr>
              <th>Строка</th>
              <th className="birzha-data-table__num">Кг</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const undoing = undoingWriteOffId === row.writeOffId;
              const busy = undoingWriteOffId != null;
              return (
                <tr key={row.writeOffId}>
                  <td>{row.label}</td>
                  <td className="birzha-data-table__num">
                    {row.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="birzha-clean-ops-text-btn"
                      disabled={busy}
                      onClick={() => onUndo(row.writeOffId)}
                    >
                      {undoing ? "…" : "Отменить"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
