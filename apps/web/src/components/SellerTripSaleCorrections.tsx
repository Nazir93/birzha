import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useAuth } from "../auth/auth-context.js";
import { apiDelete, apiFetch, assertOkResponse } from "../api/fetch-api.js";
import type { BatchListItem, TripSaleLineJson } from "../api/types.js";
import { formatNakladLineLabel } from "../format/batch-label.js";
import { kopecksToRubLabel } from "../format/money.js";
import { kgNumberToGramsBigInt } from "../format/seller-trip-caliber-groups.js";
import type { TripBatchTableRow } from "../format/trip-report-rows.js";
import {
  inferPaymentKindFromSaleLine,
  kopecksPerKgToRubDecimalString,
} from "../format/trip-sale-line-payment.js";
import { parseUpdateTripSaleForm } from "../validation/api-schemas.js";
import {
  batchesByIdsQueryOptions,
  queryRoots,
  tripSaleLinesQueryOptions,
  wholesalersFullListQueryOptions,
} from "../query/core-list-queries.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";
import { btnStyle, warnText } from "../ui/styles.js";

function gramsBigIntToKgDecimalString(g: bigint): string {
  if (g === 0n) {
    return "0";
  }
  const whole = g / 1000n;
  const rem = g % 1000n;
  if (rem === 0n) {
    return whole.toString();
  }
  return `${whole}.${rem.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

function lineHasPkgData(batchId: string, sellableRows: TripBatchTableRow[]): boolean {
  const row = sellableRows.find((r) => r.batchId === batchId);
  return row ? row.shippedPackages > 0n : false;
}

function maxKgForLineCorrection(line: TripSaleLineJson, sellableRows: TripBatchTableRow[]): bigint {
  const row = sellableRows.find((r) => r.batchId === line.batchId);
  const lineG = kgNumberToGramsBigInt(Number(line.kg.replace(",", ".")));
  if (!row) {
    return lineG;
  }
  return row.netTransitG + lineG;
}

function maxPkgForLineCorrection(line: TripSaleLineJson, sellableRows: TripBatchTableRow[]): bigint {
  const row = sellableRows.find((r) => r.batchId === line.batchId);
  const linePkg = line.packageCount ? BigInt(line.packageCount) : 0n;
  if (!row || row.shippedPackages <= 0n) {
    return linePkg;
  }
  const est = row.shippedG > 0n && row.netTransitG > 0n ? (row.shippedPackages * row.netTransitG) / row.shippedG : 0n;
  return est + linePkg;
}

async function apiPatchJson(url: string, body: unknown): Promise<void> {
  const res = await apiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await assertOkResponse(res, url);
}

function SellerTripSaleEditForm({
  line,
  batchById,
  sellableRows,
  wholesalersCatalog,
  onDone,
  onCancel,
}: {
  line: TripSaleLineJson;
  batchById: Map<string, BatchListItem>;
  sellableRows: TripBatchTableRow[];
  wholesalersCatalog: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const b = batchById.get(line.batchId);
  const label = b ? formatNakladLineLabel(b) : "партия";
  const requirePkg = lineHasPkgData(line.batchId, sellableRows);
  const payment0 = inferPaymentKindFromSaleLine(line);

  const [kg, setKg] = useState(line.kg);
  const [packages, setPackages] = useState(line.packageCount ?? "");
  const [price, setPrice] = useState(kopecksPerKgToRubDecimalString(line.pricePerKgKopecks));
  const [saleChannel, setSaleChannel] = useState<"retail" | "wholesale">(line.saleChannel);
  const [paymentKind, setPaymentKind] = useState(payment0);
  const [wholesaleBuyerId, setWholesaleBuyerId] = useState(line.wholesaleBuyerId ?? "");
  const [cashMixed, setCashMixed] = useState(() =>
    payment0 === "mixed" ? kopecksToRubLabel(line.cashKopecks).replace(/\s/g, "").replace("₽", "") : "",
  );
  const [cardTransfer, setCardTransfer] = useState(() =>
    payment0 === "card_transfer"
      ? kopecksToRubLabel(line.cardTransferKopecks).replace(/\s/g, "").replace("₽", "")
      : "",
  );

  const wholesalersQ = useQuery({
    ...wholesalersFullListQueryOptions(),
    enabled: wholesalersCatalog && saleChannel === "wholesale",
  });

  const blockReason = useMemo(() => {
    if (!kg.trim()) {
      return "Укажите кг";
    }
    if (!price.trim()) {
      return "Укажите цену за кг";
    }
    if (requirePkg && !packages.trim()) {
      return "Укажите количество ящиков";
    }
    if (saleChannel === "wholesale" && wholesalersCatalog && !wholesaleBuyerId.trim()) {
      return "Выберите оптовика";
    }
    const kgNum = Number(kg.replace(",", "."));
    if (Number.isFinite(kgNum) && kgNum > 0) {
      const maxG = maxKgForLineCorrection(line, sellableRows);
      if (kgNumberToGramsBigInt(kgNum) > maxG) {
        return `Не больше ${gramsBigIntToKgDecimalString(maxG)} кг в машине`;
      }
    }
    if (requirePkg && packages.trim()) {
      const n = Number.parseInt(packages, 10);
      if (Number.isFinite(n) && n > 0) {
        const maxPkg = maxPkgForLineCorrection(line, sellableRows);
        if (BigInt(n) > maxPkg) {
          return `Не больше ${String(maxPkg)} ящ.`;
        }
      }
    }
    return null;
  }, [kg, price, packages, requirePkg, saleChannel, wholesalersCatalog, wholesaleBuyerId, line.batchId, sellableRows, batchById]);

  const save = useMutation({
    mutationFn: async () => {
      const body = parseUpdateTripSaleForm({
        kg,
        pricePerKg: price,
        saleChannel,
        wholesaleBuyerId: saleChannel === "wholesale" ? wholesaleBuyerId : undefined,
        paymentKind,
        cashMixed,
        cardTransferKopecks: cardTransfer,
        packageCountRaw: packages,
        requirePackageCount: requirePkg,
        sellerMoneyInRubles: true,
      });
      await apiPatchJson(`/api/trip-sales/${encodeURIComponent(line.id)}`, body);
    },
    onSuccess: onDone,
  });

  const fieldMb = { marginBottom: "0.45rem" as const, maxWidth: "100%" as const };

  return (
    <div
      className="birzha-callout-info"
      style={{ marginTop: "0.65rem", padding: "0.75rem" }}
      role="form"
      aria-label={`Правка продажи ${label}`}
    >
      <p className="birzha-form-label" style={{ margin: "0 0 0.5rem" }}>
        Правка: <strong>{label}</strong>
      </p>
      <label className="birzha-form-label birzha-form-label--block">кг *</label>
      <input
        value={kg}
        onChange={(e) => setKg(e.target.value)}
        className="birzha-seller-form-control"
        style={fieldMb}
        inputMode="decimal"
      />
      {requirePkg ? (
        <>
          <label className="birzha-form-label birzha-form-label--block">ящики *</label>
          <input
            value={packages}
            onChange={(e) => setPackages(e.target.value)}
            className="birzha-seller-form-control"
            style={fieldMb}
            inputMode="numeric"
          />
        </>
      ) : null}
      <label className="birzha-form-label birzha-form-label--block">₽/кг *</label>
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="birzha-seller-form-control"
        style={fieldMb}
        inputMode="decimal"
      />
      <label className="birzha-form-label birzha-form-label--block">Тип сделки</label>
      <select
        value={saleChannel}
        onChange={(e) => setSaleChannel(e.target.value as "retail" | "wholesale")}
        className="birzha-seller-form-control"
        style={fieldMb}
      >
        <option value="retail">Розница</option>
        <option value="wholesale" disabled={!wholesalersCatalog}>
          Опт
        </option>
      </select>
      {saleChannel === "wholesale" && wholesalersCatalog ? (
        <>
          <label className="birzha-form-label birzha-form-label--block">Оптовик *</label>
          <select
            value={wholesaleBuyerId}
            onChange={(e) => setWholesaleBuyerId(e.target.value)}
            className="birzha-seller-form-control"
            style={fieldMb}
          >
            <option value="">— выберите —</option>
            {(wholesalersQ.data?.wholesalers ?? [])
              .filter((w) => w.isActive)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </>
      ) : null}
      <label className="birzha-form-label birzha-form-label--block">Оплата</label>
      <select
        value={paymentKind}
        onChange={(e) => setPaymentKind(e.target.value as typeof paymentKind)}
        className="birzha-seller-form-control"
        style={fieldMb}
      >
        <option value="cash">Наличными</option>
        <option value="debt">В долг</option>
        <option value="mixed">Наличные + долг</option>
        <option value="card_transfer">Перевод + наличные</option>
      </select>
      {paymentKind === "mixed" ? (
        <>
          <label className="birzha-form-label birzha-form-label--block">Наличными, руб *</label>
          <input
            value={cashMixed}
            onChange={(e) => setCashMixed(e.target.value)}
            className="birzha-seller-form-control"
            style={fieldMb}
            inputMode="decimal"
          />
        </>
      ) : null}
      {paymentKind === "card_transfer" ? (
        <>
          <label className="birzha-form-label birzha-form-label--block">Перевод на карту, руб *</label>
          <input
            value={cardTransfer}
            onChange={(e) => setCardTransfer(e.target.value)}
            className="birzha-seller-form-control"
            style={fieldMb}
            inputMode="decimal"
          />
        </>
      ) : null}
      {blockReason ? (
        <p style={{ ...warnText, marginTop: 0 }} role="status">
          {blockReason}
        </p>
      ) : null}
      <div style={{ marginTop: "0.55rem" }}>
        <button
          type="button"
          style={{ ...btnStyle, marginRight: "0.5rem" }}
          disabled={save.isPending || Boolean(blockReason)}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Сохранение…" : "Сохранить правку"}
        </button>
        <button type="button" style={btnStyle} disabled={save.isPending} onClick={onCancel}>
          Отмена
        </button>
      </div>
      <FieldError error={save.error as Error | null} />
    </div>
  );
}

export function SellerTripSaleCorrections({
  tripId,
  tripOpen,
  sellableRows,
}: {
  tripId: string;
  tripOpen: boolean;
  sellableRows: TripBatchTableRow[];
}) {
  const { meta } = useAuth();
  const wholesalersCatalog = meta?.wholesalersCatalogApi === "enabled";
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const linesQ = useQuery({
    ...tripSaleLinesQueryOptions(tripId),
    enabled: tripId.trim().length > 0 && tripOpen,
  });

  const batchIds = useMemo(
    () => [...new Set((linesQ.data?.lines ?? []).map((l) => l.batchId))],
    [linesQ.data?.lines],
  );
  const batchesQ = useQuery(batchesByIdsQueryOptions(batchIds));
  const batchById = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesQ.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesQ.data?.batches]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    void queryClient.invalidateQueries({ queryKey: queryRoots.tripSaleLines });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
  };

  const remove = useMutation({
    mutationFn: async (lineId: string) => {
      await apiDelete(`/api/trip-sales/${encodeURIComponent(lineId)}`);
    },
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
  });

  if (!tripOpen) {
    return (
      <p className="birzha-text-muted birzha-ui-sm" style={{ marginTop: "0.75rem" }}>
        Рейс закрыт — правки продаж недоступны. Итоги в разделе «Архив».
      </p>
    );
  }

  return (
    <BirzhaDisclosure
      className="birzha-seller-sale-corrections"
      defaultOpen={false}
      title={
        <h4 className="birzha-form-label" style={{ margin: 0, fontSize: "1rem" }}>
          Исправить продажи по рейсу
        </h4>
      }
    >
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.65rem" }}>
        Можно изменить или отменить свою продажу, пока рейс не закрыт в админке.
      </p>
      {linesQ.isPending ? (
        <LoadingIndicator size="sm" label="Загрузка продаж…" />
      ) : linesQ.isError ? (
        <p style={warnText} role="alert">
          Не удалось загрузить список продаж.
        </p>
      ) : (linesQ.data?.lines.length ?? 0) === 0 ? (
        <BirzhaEmptyState compact title="Пока нет продаж по этому рейсу" />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {(linesQ.data?.lines ?? []).map((line) => {
            const b = batchById.get(line.batchId);
            const headline = b ? formatNakladLineLabel(b) : "—";
            const sum = kopecksToRubLabel(line.revenueKopecks);
            const isEditing = editingId === line.id;
            return (
              <li
                key={line.id}
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  padding: "0.55rem 0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.35rem 0.75rem",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ flex: "1 1 12rem" }}>
                    <strong>{headline}</strong>
                    <span className="birzha-text-muted">
                      {" "}
                      · {line.kg} кг
                      {line.packageCount ? ` · ${line.packageCount} ящ` : ""} · {sum} ₽
                    </span>
                  </span>
                  {!isEditing ? (
                    <span style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      <button type="button" style={btnStyle} onClick={() => setEditingId(line.id)}>
                        Исправить
                      </button>
                      <button
                        type="button"
                        style={btnStyle}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Удалить продажу ${line.kg} кг (${sum} ₽)? Масса вернётся в остаток «в машине».`,
                            )
                          ) {
                            remove.mutate(line.id);
                          }
                        }}
                      >
                        Удалить
                      </button>
                    </span>
                  ) : null}
                </div>
                {isEditing ? (
                  <SellerTripSaleEditForm
                    line={line}
                    batchById={batchById}
                    sellableRows={sellableRows}
                    wholesalersCatalog={wholesalersCatalog}
                    onDone={() => {
                      setEditingId(null);
                      invalidate();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <FieldError error={remove.error as Error | null} />
    </BirzhaDisclosure>
  );
}

