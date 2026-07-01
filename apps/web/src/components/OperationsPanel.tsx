import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { compareProductGradeCodes } from "@birzha/contracts";
import { apiPostJson } from "../api/fetch-api.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatBatchPartyCaption } from "../format/batch-label.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { clearDistributionShipPayload, readDistributionShipPayload } from "../distribution/distribution-ship-payload.js";
import { WarningAlert } from "../ui/ErrorAlerts.js";
import { btnStyle, fieldStyle, successText } from "../ui/styles.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingBlock, LoadingIndicator, StaleDataNotice } from "../ui/LoadingIndicator.js";
import {
  batchesStockOnlyQueryOptions,
  queryRoots,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { BatchesByNakladnayaReference } from "./BatchesByNakladnayaReference.js";
import { parseRecordTripShortageForm, parseShipForm } from "../validation/api-schemas.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };

export function OperationsPanel() {
  const queryClient = useQueryClient();

  const invalidateDomain = () => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
  };

  const batchesQuery = useQuery(batchesStockOnlyQueryOptions(500));

  const tripsQuery = useQuery(tripsFullListQueryOptions());
  const tripSelectOptions = useMemo(
    () => sortTripsByTripNumberAsc(tripsQuery.data?.trips ?? []),
    [tripsQuery.data?.trips],
  );

  const shippableBatches = useMemo(() => {
    const list = batchesQuery.data?.batches ?? [];
    return list
      .filter((b) => b.onWarehouseKg > 0)
      .filter(isFromPurchaseNakladnaya)
      .sort((a, b) => {
        const na = a.nakladnaya?.documentNumber ?? "";
        const nb = b.nakladnaya?.documentNumber ?? "";
        if (na !== nb) {
          return na.localeCompare(nb, "ru");
        }
        const ga = a.nakladnaya?.productGradeCode ?? "";
        const gb = b.nakladnaya?.productGradeCode ?? "";
        if (ga !== gb) {
          return compareProductGradeCodes(ga, gb);
        }
        return a.id.localeCompare(b.id);
      });
  }, [batchesQuery.data?.batches]);

  const [shipTripId, setShipTripId] = useState("");
  const [distributionPayload, setDistributionPayload] = useState(() => readDistributionShipPayload());

  const distributionRows = useMemo(() => {
    if (!distributionPayload) {
      return [] as typeof shippableBatches;
    }
    const ids = new Set(distributionPayload.batchIds);
    return shippableBatches.filter((b) => ids.has(b.id));
  }, [distributionPayload, shippableBatches]);

  const distributionMissingCount = distributionPayload
    ? Math.max(0, distributionPayload.batchIds.length - distributionRows.length)
    : 0;
  const distributionTotalKg = useMemo(
    () => distributionRows.reduce((sum, b) => sum + b.onWarehouseKg, 0),
    [distributionRows],
  );

  const shipDistributionSelection = useMutation({
    mutationFn: async () => {
      const tripT = shipTripId.trim();
      if (!tripT) {
        throw new Error("Выберите рейс");
      }
      if (!distributionPayload || distributionRows.length === 0) {
        throw new Error("Нет собранных строк с остатком на складе");
      }
      for (const b of distributionRows) {
        const { batchId, body } = parseShipForm(b.id, tripT, String(b.onWarehouseKg), "");
        await apiPostJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
      }
    },
    onSuccess: () => {
      clearDistributionShipPayload();
      setDistributionPayload(null);
      invalidateDomain();
    },
  });

  const [shortBatchId, setShortBatchId] = useState("");
  const [shortTripId, setShortTripId] = useState("");
  const [shortKg, setShortKg] = useState("");
  const [shortReason, setShortReason] = useState("");

  const shortage = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseRecordTripShortageForm(shortBatchId, shortTripId, shortKg, shortReason);
      await apiPostJson(`/api/batches/${encodeURIComponent(batchId)}/record-trip-shortage`, body);
    },
    onSuccess: () => invalidateDomain(),
  });

  return (
    <div role="region" aria-label="Недостача по рейсу и справочно партии">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Недостача по рейсу</h2>

      {batchesQuery.isError ? (
        <WarningAlert title="Партии">Список партий не загрузился. Проверьте связь и повторите.</WarningAlert>
      ) : null}
      <StaleDataNotice show={batchesQuery.isFetching && !batchesQuery.isPending} label="Обновление списка партий…" />
      {batchesQuery.isPending && (
        <LoadingBlock label="Загрузка партий и остатков…" minHeight={96} skeleton skeletonRows={6} />
      )}

      {distributionPayload ? (
        <BirzhaDisclosure defaultOpen title="Отгрузить собранное из распределения">
          <label htmlFor="op-sel-ship-trip-dist" className="birzha-form-label">
            Рейс *
          </label>
          {tripsQuery.isPending && (
            <p style={{ margin: "0.15rem 0 0.35rem" }} role="status" aria-live="polite">
              <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
            </p>
          )}
          <select
            id="op-sel-ship-trip-dist"
            value={shipTripId}
            onChange={(e) => setShipTripId(e.target.value)}
            style={{ ...selectWide, marginBottom: "0.75rem" }}
            disabled={tripsQuery.isPending}
            aria-busy={tripsQuery.isPending || undefined}
          >
            <option value="">{tripsQuery.isPending ? "— загрузка —" : "— выберите рейс —"}</option>
            {tripSelectOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTripSelectLabel(t)}
              </option>
            ))}
          </select>

          <div className="birzha-inline-panel" style={{ margin: "0 0 0.75rem" }}>
            <p className="birzha-callout-info" style={{ margin: 0 }}>
              К отправке: <strong>{distributionRows.length}</strong> парт.,{" "}
              <strong>{distributionTotalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг.
              {distributionMissingCount > 0 ? (
                <> Уже не на складе или списано: {distributionMissingCount} парт.</>
              ) : null}
            </p>
            <button
              type="button"
              style={{ ...btnStyle, marginTop: "0.35rem" }}
              disabled={shipDistributionSelection.isPending || !shipTripId.trim() || distributionRows.length === 0}
              aria-busy={shipDistributionSelection.isPending || undefined}
              onClick={() => shipDistributionSelection.mutate()}
            >
              {shipDistributionSelection.isPending ? "Отгрузка…" : "Отгрузить собранное в этот рейс"}
            </button>{" "}
            <button
              type="button"
              style={{ ...btnStyle, marginTop: "0.35rem" }}
              onClick={() => {
                clearDistributionShipPayload();
                setDistributionPayload(null);
              }}
            >
              Сбросить
            </button>
            <FieldError error={shipDistributionSelection.error as Error | null} />
            {shipDistributionSelection.isSuccess ? (
              <p style={successText} role="status">
                Собранное отгружено. При необходимости вернитесь в распределение за новым подбором.
              </p>
            ) : null}
          </div>
        </BirzhaDisclosure>
      ) : null}

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-title birzha-section-title--sm" style={{ margin: 0 }}>
              Зафиксировать недостачу
            </span>
          </span>
        }
      >
        <label htmlFor="op-in-short-batch" className="birzha-form-label">
          Партия *
        </label>
        <select
          id="op-in-short-batch"
          value={shortBatchId}
          onChange={(e) => setShortBatchId(e.target.value)}
          style={selectWide}
          disabled={batchesQuery.isPending}
        >
          <option value="">{batchesQuery.isPending ? "— загрузка —" : "— выберите партию —"}</option>
          {(batchesQuery.data?.batches ?? [])
            .filter(isFromPurchaseNakladnaya)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {formatBatchPartyCaption(b)}
              </option>
            ))}
        </select>
        <label htmlFor="op-sel-short-trip" className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
          Рейс *
        </label>
        <select
          id="op-sel-short-trip"
          value={shortTripId}
          onChange={(e) => setShortTripId(e.target.value)}
          style={selectWide}
          disabled={tripsQuery.isPending}
          aria-busy={tripsQuery.isPending || undefined}
        >
          <option value="">{tripsQuery.isPending ? "— загрузка —" : "— выберите рейс —"}</option>
          {tripSelectOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {formatTripSelectLabel(t)}
            </option>
          ))}
        </select>
        <label htmlFor="op-in-short-kg" className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
          kg *
        </label>
        <input
          id="op-in-short-kg"
          value={shortKg}
          onChange={(e) => setShortKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <label htmlFor="op-in-short-reason" className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
          Причина *
        </label>
        <input
          id="op-in-short-reason"
          value={shortReason}
          onChange={(e) => setShortReason(e.target.value)}
          style={fieldStyle}
          autoComplete="off"
        />
        <button
          type="button"
          style={btnStyle}
          disabled={shortage.isPending}
          aria-busy={shortage.isPending || undefined}
          onClick={() => shortage.mutate()}
        >
          {shortage.isPending ? "…" : "Зафиксировать недостачу"}
        </button>
        <FieldError error={shortage.error as Error | null} />
        {shortage.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}
      </BirzhaDisclosure>

      {!batchesQuery.isPending && batchesQuery.data && (
        <BirzhaDisclosure title="Партии по закупочным накладным" defaultOpen={false}>
          <BatchesByNakladnayaReference
            batches={batchesQuery.data.batches}
            isLoading={false}
            sectionHeadingId="op-batches-heading"
            showBulkExpandControls={false}
          />
        </BirzhaDisclosure>
      )}

      {tripsQuery.isError ? (
        <WarningAlert title="Рейсы">
          Список рейсов не загрузился — выберите рейс вручную или повторите позже.
        </WarningAlert>
      ) : null}
    </div>
  );
}
