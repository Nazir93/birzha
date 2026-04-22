import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { BATCH_DESTINATIONS, BATCH_QUALITY_TIERS } from "@birzha/contracts";
import { apiFetch } from "../api/fetch-api.js";
import type { BatchListItem, BatchesListResponse } from "../api/types.js";
import { formatBatchPartyCaption, formatShortBatchId } from "../format/batch-label.js";
import { purchaseNakladnayaDocumentPath, routes } from "../routes.js";
import { LoadingBlock, StaleDataNotice } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, fieldStyle, muted, tableStyle, thHead, thtd, warnText } from "../ui/styles.js";

const labelsQuality: Record<(typeof BATCH_QUALITY_TIERS)[number], string> = {
  standard: "стандарт (для регионов и «нормальной» реализации)",
  weak: "слабый (уценка, отдельный контур)",
  reject: "брак (не в продажу)",
};

const labelsDestination: Record<(typeof BATCH_DESTINATIONS)[number], string> = {
  moscow: "Москва",
  regions: "Регионы",
  discount: "Уценка / распродажа",
  writeoff: "Списание",
};

type RowEdit = { quality: string; destination: string };

function toSelectValue(
  v: string | null | undefined,
  allowed: readonly string[],
  emptyLabel: "empty" | "not_set",
): string {
  if (v && allowed.includes(v)) {
    return v;
  }
  return emptyLabel === "not_set" ? "_notset" : "";
}

export function AllocationPanel() {
  const queryClient = useQueryClient();
  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const res = await apiFetch("/api/batches");
      if (!res.ok) {
        throw new Error(`batches ${res.status}`);
      }
      return res.json() as Promise<BatchesListResponse>;
    },
    retry: 1,
  });

  const [edits, setEdits] = useState<Record<string, RowEdit | undefined>>({});

  const getEdit = (b: BatchListItem): RowEdit => {
    const e = edits[b.id];
    if (e) {
      return e;
    }
    const a = b.allocation;
    return {
      quality: toSelectValue(a?.qualityTier ?? null, BATCH_QUALITY_TIERS, "not_set"),
      destination: toSelectValue(a?.destination ?? null, BATCH_DESTINATIONS, "not_set"),
    };
  };

  const save = useMutation({
    mutationFn: async ({ batchId, quality, destination }: { batchId: string; quality: string; destination: string }) => {
      const body = {
        qualityTier: (quality === "_notset" ? null : quality) as string | null,
        destination: (destination === "_notset" ? null : destination) as string | null,
      };
      const res = await apiFetch(`/api/batches/${encodeURIComponent(batchId)}/allocation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 503) {
        throw new Error("Нужна PostgreSQL на сервере (распределение не доступно в тестовом in-memory).");
      }
      if (res.status === 403) {
        throw new Error("Недостаточно прав (нужна роль закупки/склада/руководства).");
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
    },
    onSuccess: (_d, { batchId }) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[batchId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const onSaveRow = (b: BatchListItem) => {
    const e = getEdit(b);
    save.mutate({ batchId: b.id, quality: e.quality, destination: e.destination });
  };

  if (batchesQuery.isError) {
    return (
      <p role="alert" style={errorText}>
        Не удалось загрузить партии. Запустите API с PostgreSQL для распределения.
      </p>
    );
  }

  const list = (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0);
  const loading = batchesQuery.isPending;
  const refetching = batchesQuery.isFetching && !batchesQuery.isPending;

  return (
    <div role="region" aria-label="Распределение по качеству и направлению">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Распределение по качеству и направлению</h2>
      <p style={muted}>
        <strong>Шаг 3 процесса:</strong> по каждой партии с остатком на складе укажите <strong>оценку качества</strong> и
        куда планируется <strong>направление</strong> (Москва, регионы, уценка, списание). Это не делит партию автоматически — фиксирует
        решение для дальнейших шагов (отгрузка в рейс, продажа). См. также{" "}
        <Link to={routes.operations} style={{ fontWeight: 600 }}>
          Операции
        </Link>{" "}
        и <Link to={routes.reports}>отчёты</Link>.
      </p>
      <p style={{ ...warnText, fontSize: "0.86rem" }}>
        Требуется <strong>PostgreSQL</strong>: <code>PATCH /api/batches/…/allocation</code> без БД на сервере не выполняется.
      </p>

      {loading && <LoadingBlock label="Загрузка партий (GET /api/batches)…" minHeight={100} />}

      <StaleDataNotice show={refetching} label="Обновление списка партий…" />

      {!loading && list.length === 0 && (
        <p style={muted}>
          Нет партий с остатком на складе — сначала оформите закупку по накладной (вкладка{" "}
          <Link to={routes.purchaseNakladnaya}>Накладная</Link>).
        </p>
      )}

      {list.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle} aria-label="Партии: качество и направление">
            <thead>
              <tr>
                <th scope="col" style={thHead}>
                  Партия
                </th>
                <th scope="col" style={thHead}>
                  Остаток, кг
                </th>
                <th scope="col" style={thHead}>
                  Качество
                </th>
                <th scope="col" style={thHead}>
                  Направление
                </th>
                <th scope="col" style={thHead} />
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const label = formatBatchPartyCaption(b, b.id);
                const e = getEdit(b);
                return (
                  <tr key={b.id}>
                    <td style={thtd}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{label}</div>
                      {b.nakladnaya?.documentId && (
                        <Link
                          to={purchaseNakladnayaDocumentPath(b.nakladnaya.documentId)}
                          style={{ fontSize: "0.82rem" }}
                        >
                          накладная
                        </Link>
                      )}
                      <div>
                        <code style={{ fontSize: "0.75rem", color: "#71717a" }}>{formatShortBatchId(b.id)}</code>
                      </div>
                    </td>
                    <td style={thtd}>{b.onWarehouseKg}</td>
                    <td style={thtd}>
                      <select
                        aria-label="Качество"
                        value={e.quality}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          setEdits((prev) => ({ ...prev, [b.id]: { ...e, quality: v } }));
                        }}
                        style={fieldStyle}
                      >
                        <option value="_notset">— не выбрано —</option>
                        {BATCH_QUALITY_TIERS.map((c) => (
                          <option key={c} value={c}>
                            {labelsQuality[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={thtd}>
                      <select
                        aria-label="Направление"
                        value={e.destination}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          setEdits((prev) => ({ ...prev, [b.id]: { ...e, destination: v } }));
                        }}
                        style={fieldStyle}
                      >
                        <option value="_notset">— не выбрано —</option>
                        {BATCH_DESTINATIONS.map((c) => (
                          <option key={c} value={c}>
                            {labelsDestination[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={thtd}>
                      <button
                        type="button"
                        style={btnStyle}
                        disabled={save.isPending}
                        onClick={() => onSaveRow(b)}
                      >
                        {save.isPending ? "…" : "Сохранить"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {save.isError && (
        <p role="alert" style={{ ...errorText, marginTop: "0.75rem" }}>
          {(save.error as Error).message}
        </p>
      )}
    </div>
  );
}
