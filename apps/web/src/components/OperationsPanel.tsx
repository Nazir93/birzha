import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { apiPostJson } from "../api/fetch-api.js";
import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { distributeIntegersProRata } from "../format/distribute-integers-pro-rata.js";
import { clearDistributionShipPayload, readDistributionShipPayload } from "../distribution/distribution-ship-payload.js";
import { btnStyle, fieldStyle, successText, warnText } from "../ui/styles.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingBlock, LoadingIndicator, StaleDataNotice } from "../ui/LoadingIndicator.js";
import {
  batchesFullListQueryOptions,
  queryRoots,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import {
  purchaseNakladnayaBasePathForPath,
  purchaseNakladnayaDocumentPathForPath,
} from "../routes.js";
import { BatchesByNakladnayaReference } from "./BatchesByNakladnayaReference.js";
import { SellFromTripSection } from "./SellFromTripSection.js";
import { parseRecordTripShortageForm, parseShipForm } from "../validation/api-schemas.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };

/** Подпись партии в форме отгрузки: накладная + товар/калибр + остаток на складе. */
function formatBatchShipLabel(b: BatchListItem): string {
  const kg = b.onWarehouseKg;
  const nn = b.nakladnaya?.documentNumber?.trim();
  const line = formatNakladLineLabel(b);
  if (nn && line !== "—") {
    return `№ ${nn} · ${line} — ${kg} кг на складе`;
  }
  if (line !== "—") {
    return `${line} — ${kg} кг на складе`;
  }
  return `Партия ${formatShortBatchId(b.id)} — ${kg} кг на складе`;
}

export function OperationsPanel() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const purchaseNakladnayaBasePath = purchaseNakladnayaBasePathForPath(location.pathname);
  const invalidateDomain = () => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
  };

  const batchesQuery = useQuery(batchesFullListQueryOptions());

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
        return ga.localeCompare(gb, "ru");
      }
      return a.id.localeCompare(b.id);
    });
  }, [batchesQuery.data?.batches]);

  const nakladOptionsForShipAll = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of shippableBatches) {
      const docId = b.nakladnaya?.documentId;
      const num = b.nakladnaya?.documentNumber;
      if (docId && num) {
        seen.set(docId, num);
      }
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "ru"))
      .map(([documentId, documentNumber]) => ({ documentId, documentNumber }));
  }, [shippableBatches]);

  const [shipBatchId, setShipBatchId] = useState("");
  const [shipTripId, setShipTripId] = useState("");
  const [shipKg, setShipKg] = useState("");
  const [shipPackages, setShipPackages] = useState("");
  const [shipAllDocumentId, setShipAllDocumentId] = useState("");
  /** Всего ящиков в отгрузке «вся накладная»; распределяются по строкам пропорционально кг. */
  const [shipAllTotalPackages, setShipAllTotalPackages] = useState("");
  const [distributionPayload, setDistributionPayload] = useState(() => readDistributionShipPayload());

  const distributionRows = useMemo(() => {
    if (!distributionPayload) {
      return [] as BatchListItem[];
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

  const ship = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseShipForm(shipBatchId, shipTripId, shipKg, shipPackages);
      await apiPostJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
    },
    onSuccess: () => invalidateDomain(),
  });

  const shipAllFromNaklad = useMutation({
    mutationFn: async () => {
      const tripT = shipTripId.trim();
      if (!tripT) {
        throw new Error("Выберите рейс");
      }
      if (!shipAllDocumentId) {
        throw new Error("Выберите накладную");
      }
      const rows = shippableBatches
        .filter((b) => b.nakladnaya?.documentId === shipAllDocumentId)
        .slice()
        .sort((a, b) => {
          const g = (a.nakladnaya?.productGradeCode ?? "").localeCompare(b.nakladnaya?.productGradeCode ?? "", "ru");
          if (g !== 0) {
            return g;
          }
          return a.id.localeCompare(b.id);
        });
      if (rows.length === 0) {
        throw new Error("Нет остатка на складе по строкам этой накладной");
      }
      const pkgRaw = shipAllTotalPackages.trim();
      let perLinePackages: number[] | null = null;
      if (pkgRaw !== "") {
        const totalPk = Number.parseInt(pkgRaw, 10);
        if (!Number.isFinite(totalPk) || totalPk < 0) {
          throw new Error("Ящики (всего): целое неотрицательное число или пусто");
        }
        const w = rows.map((b) => b.onWarehouseKg);
        perLinePackages = distributeIntegersProRata(w, totalPk);
      }
      for (let i = 0; i < rows.length; i++) {
        const b = rows[i]!;
        const pkgStr =
          perLinePackages === null
            ? ""
            : (perLinePackages[i] ?? 0) > 0
              ? String(perLinePackages[i])
              : "";
        const { batchId, body } = parseShipForm(b.id, tripT, String(b.onWarehouseKg), pkgStr);
        await apiPostJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
      }
    },
    onSuccess: () => {
      invalidateDomain();
      setShipAllDocumentId("");
      setShipAllTotalPackages("");
    },
  });

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
    <div role="region" aria-label="Операции по партиям и рейсу">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Операции по партиям и рейсу</h2>

      {batchesQuery.data && (
        <datalist id="batch-suggestions">
          {batchesQuery.data.batches
            .filter(isFromPurchaseNakladnaya)
            .map((b) => (
            <option key={b.id} value={b.id} />
          ))}
        </datalist>
      )}

      {batchesQuery.isError && <p style={warnText}>Список партий не загрузился. Проверьте связь и повторите.</p>}
      <StaleDataNotice
        show={batchesQuery.isFetching && !batchesQuery.isPending}
        label="Обновление списка партий…"
      />
      {batchesQuery.isPending && (
        <LoadingBlock label="Загрузка партий и остатков…" minHeight={96} skeleton skeletonRows={6} />
      )}

      {!batchesQuery.isPending && batchesQuery.data && (
        <BirzhaDisclosure title="Партии по закупочным накладным" hint="остатки на складе" defaultOpen>
          <BatchesByNakladnayaReference
            batches={batchesQuery.data.batches}
            isLoading={false}
            sectionHeadingId="op-batches-heading"
            showBulkExpandControls={false}
          />
        </BirzhaDisclosure>
      )}

      {tripsQuery.isError && (
        <p style={warnText}>Список рейсов не загрузился — выберите рейс вручную или повторите позже.</p>
      )}

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Шаг 1</span>
            <span id="op-sec-ship" className="birzha-section-title birzha-section-title--sm">
              Отгрузить в рейс
            </span>
          </span>
        }
        hint="Партия или вся накладная"
      >
        <label htmlFor="op-sel-ship-trip" className="birzha-form-label">
          Рейс *
        </label>
        {tripsQuery.isPending && (
          <p style={{ margin: "0.15rem 0 0.35rem" }} role="status" aria-live="polite">
            <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
          </p>
        )}
        <select
          id="op-sel-ship-trip"
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

        {distributionPayload ? (
          <div className="birzha-inline-panel" style={{ margin: "0 0 0.9rem" }}>
            <h4 style={{ margin: "0 0 0.35rem", fontSize: "0.92rem", fontWeight: 700 }}>
              Погрузочная накладная из распределения
            </h4>
            <p className="birzha-callout-info">
              К отправке: <strong>{distributionRows.length}</strong> парт.,{" "}
              <strong>{distributionTotalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг.
              {distributionMissingCount > 0 ? (
                <> Уже не на складе или списано: {distributionMissingCount} парт.</>
              ) : null}
            </p>
            <button
              type="button"
              style={{ ...btnStyle, marginTop: 0 }}
              disabled={shipDistributionSelection.isPending || !shipTripId.trim() || distributionRows.length === 0}
              aria-busy={shipDistributionSelection.isPending || undefined}
              onClick={() => shipDistributionSelection.mutate()}
            >
              {shipDistributionSelection.isPending ? "Отгрузка…" : "Отгрузить собранную накладную в этот рейс"}
            </button>{" "}
            <button
              type="button"
              style={{ ...btnStyle, marginTop: 0 }}
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
                Собранная накладная отгружена. В распределении эти партии больше не будут показываться как остаток склада.
              </p>
            ) : null}
          </div>
        ) : null}

        <>
            <h4 style={{ margin: "0 0 0.35rem", fontSize: "0.92rem", fontWeight: 600 }}>Одна партия (накладная · калибр)</h4>
        <label htmlFor="op-sel-ship-batch" className="birzha-form-label">
          Партия *
        </label>
        <select
          id="op-sel-ship-batch"
          value={shipBatchId}
          onChange={(e) => {
            const id = e.target.value;
            setShipBatchId(id);
            const b = batchesQuery.data?.batches.find((x) => x.id === id);
            if (b && b.onWarehouseKg > 0) {
              setShipKg(String(b.onWarehouseKg));
            }
          }}
          style={selectWide}
          disabled={batchesQuery.isPending}
          aria-busy={batchesQuery.isPending || undefined}
        >
          <option value="">{batchesQuery.isPending ? "— загрузка партий —" : "— выберите партию —"}</option>
          {shippableBatches.map((b) => (
            <option key={b.id} value={b.id}>
              {formatBatchShipLabel(b)}
            </option>
          ))}
        </select>
        {shippableBatches.length === 0 && batchesQuery.data && (
          <BirzhaEmptyState
            compact
            title="Нечего отгружать"
            description={
              <>
                Нет партий с остатком на складе — сначала оформите приём в разделе{" "}
                <Link to={purchaseNakladnayaBasePath}>Закупка товара</Link>.
              </>
            }
          />
        )}
        <label
          htmlFor="op-in-ship-batch-id"
          className="birzha-form-label birzha-form-label--block birzha-form-label--push-xs"
        >
          Идентификатор партии (дублирует выбор выше)
        </label>
        <input
          id="op-in-ship-batch-id"
          value={shipBatchId}
          onChange={(e) => {
            const id = e.target.value;
            setShipBatchId(id);
            const b = batchesQuery.data?.batches.find((x) => x.id === id);
            if (b && b.onWarehouseKg > 0) {
              setShipKg(String(b.onWarehouseKg));
            }
          }}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
          placeholder="или вставьте идентификатор партии"
        />
        <label htmlFor="op-in-ship-kg" className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
          kg *
        </label>
        <input
          id="op-in-ship-kg"
          value={shipKg}
          onChange={(e) => setShipKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <label htmlFor="op-in-ship-pkg" className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
          Ящики (опц., целое число)
        </label>
        <input
          id="op-in-ship-pkg"
          value={shipPackages}
          onChange={(e) => setShipPackages(e.target.value)}
          style={fieldStyle}
          inputMode="numeric"
          autoComplete="off"
          placeholder="пусто = не указано"
        />
        <button
          type="button"
          style={{ ...btnStyle, marginTop: "0.35rem" }}
          disabled={ship.isPending}
          aria-busy={ship.isPending || undefined}
          onClick={() => ship.mutate()}
        >
          {ship.isPending ? "…" : "Отгрузить"}
        </button>
        <FieldError error={ship.error as Error | null} />
        {ship.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}

        <h4 style={{ margin: "1rem 0 0.35rem", fontSize: "0.92rem", fontWeight: 600 }}>Вся накладная в рейс</h4>
        <p className="birzha-callout-info">
          Кг = полный остаток по строкам накладной. Ящики опционально распределяются по кг.
        </p>
        <label htmlFor="op-sel-ship-naklad-all" className="birzha-form-label">
          Закупка товара
        </label>
        <select
          id="op-sel-ship-naklad-all"
          value={shipAllDocumentId}
          onChange={(e) => {
            setShipAllDocumentId(e.target.value);
            setShipAllTotalPackages("");
          }}
          style={selectWide}
        >
          <option value="">— выберите накладную —</option>
          {nakladOptionsForShipAll.map((o) => (
            <option key={o.documentId} value={o.documentId}>
              № {o.documentNumber}
            </option>
          ))}
        </select>
        {shipAllDocumentId ? (
          <p className="birzha-callout-info" style={{ marginTop: "0.35rem", fontSize: "0.82rem" }}>
            <Link to={purchaseNakladnayaDocumentPathForPath(location.pathname, shipAllDocumentId)}>Открыть накладную</Link>
          </p>
        ) : null}
        <label htmlFor="op-in-ship-naklad-pkg-total" className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
          Ящиков в этой отгрузке по накладной, всего (опц.)
        </label>
        <input
          id="op-in-ship-naklad-pkg-total"
          value={shipAllTotalPackages}
          onChange={(e) => setShipAllTotalPackages(e.target.value)}
          style={fieldStyle}
          inputMode="numeric"
          autoComplete="off"
          placeholder="пусто = без ящиков в API; кг по строкам как обычно"
          disabled={!shipAllDocumentId}
        />
        <button
          type="button"
          style={{ ...btnStyle, marginTop: "0.35rem" }}
          disabled={
            shipAllFromNaklad.isPending ||
            !shipTripId.trim() ||
            !shipAllDocumentId ||
            nakladOptionsForShipAll.length === 0
          }
          aria-busy={shipAllFromNaklad.isPending || undefined}
          onClick={() => shipAllFromNaklad.mutate()}
        >
          {shipAllFromNaklad.isPending ? "Отгрузка…" : "Отгрузить всю накладную в этот рейс"}
        </button>
            <FieldError error={shipAllFromNaklad.error as Error | null} />
            {shipAllFromNaklad.isSuccess && (
              <p style={successText} role="status">
                Все строки с остатком отгружены.
              </p>
            )}
        </>
      </BirzhaDisclosure>

      <SellFromTripSection variant="operations" />

      <BirzhaDisclosure
        defaultOpen
        title={
          <span className="birzha-disclosure__title-stack">
            <span className="birzha-section-heading__eyebrow">Шаг 3</span>
            <span id="op-sec-short" className="birzha-section-title birzha-section-title--sm">
              Недостача по рейсу
            </span>
          </span>
        }
        hint="Партия, рейс, кг и причина при приёмке"
      >
        <label htmlFor="op-in-short-batch" className="birzha-form-label">
          Партия *
        </label>
        <input
          id="op-in-short-batch"
          value={shortBatchId}
          onChange={(e) => setShortBatchId(e.target.value)}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
        />
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
    </div>
  );
}
