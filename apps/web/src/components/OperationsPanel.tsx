import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { apiPostJson } from "../api/fetch-api.js";
import {
  clearDistributionShipPayload,
  readDistributionShipPayload,
} from "../distribution/distribution-ship-payload.js";
import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { distributeIntegersProRata } from "../format/distribute-integers-pro-rata.js";
import { useAuth } from "../auth/auth-context.js";
import { btnStyle, fieldStyle, muted, successText, warnText } from "../ui/styles.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingBlock, LoadingIndicator, StaleDataNotice } from "../ui/LoadingIndicator.js";
import { canManageInventoryCatalog } from "../auth/role-panels.js";
import {
  batchesFullListQueryOptions,
  queryRoots,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { adminRoutes, ops, purchaseNakladnayaDocumentPath } from "../routes.js";
import { BatchesByNakladnayaReference, groupBatchesByPurchaseDocument } from "./BatchesByNakladnayaReference.js";
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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const [distShipBatchIds, setDistShipBatchIds] = useState<string[] | null>(null);

  const distBatchesToShip = useMemo(() => {
    if (distShipBatchIds == null || distShipBatchIds.length === 0) {
      return [] as BatchListItem[];
    }
    const want = new Set(distShipBatchIds);
    return shippableBatches
      .filter((b) => want.has(b.id))
      .slice()
      .sort((a, b) => {
        const g = (a.nakladnaya?.productGradeCode ?? "").localeCompare(b.nakladnaya?.productGradeCode ?? "", "ru");
        if (g !== 0) {
          return g;
        }
        return a.id.localeCompare(b.id);
      });
  }, [distShipBatchIds, shippableBatches]);

  const distBatchesMissingCount = useMemo(
    () =>
      distShipBatchIds == null || distShipBatchIds.length === 0
        ? 0
        : distShipBatchIds.length - distBatchesToShip.length,
    [distShipBatchIds, distBatchesToShip.length],
  );
  const distByCaliberSummary = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of distBatchesToShip) {
      const label = formatNakladLineLabel(b);
      m.set(label, (m.get(label) ?? 0) + b.onWarehouseKg);
    }
    return [...m.entries()]
      .sort((a, c) => a[0].localeCompare(c[0], "ru"))
      .map(([line, kg]) => ({ line, kg }));
  }, [distBatchesToShip]);
  const hasDistributionSelection = (distShipBatchIds?.length ?? 0) > 0;

  const fromDistributionQ = searchParams.get("fromDistribution");
  useEffect(() => {
    if (fromDistributionQ !== "1") {
      return;
    }
    const p = readDistributionShipPayload();
    if (p && p.batchIds.length > 0) {
      setDistShipBatchIds(p.batchIds);
    }
    void navigate({ pathname: location.pathname, search: "" }, { replace: true });
  }, [fromDistributionQ, location.pathname, navigate]);

  useLayoutEffect(() => {
    if (distShipBatchIds == null || distShipBatchIds.length === 0) {
      return;
    }
    requestAnimationFrame(() => {
      document.getElementById("op-sec-ship")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [distShipBatchIds]);

  const batchesGroupedCount = useMemo(
    () => groupBatchesByPurchaseDocument(batchesQuery.data?.batches).length,
    [batchesQuery.data?.batches],
  );

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

  const shipFromDistribution = useMutation({
    mutationFn: async () => {
      const tripT = shipTripId.trim();
      if (!tripT) {
        throw new Error("Выберите рейс");
      }
      if (distBatchesToShip.length === 0) {
        throw new Error("Нет партий с остатком по этому отбору");
      }
      for (const b of distBatchesToShip) {
        const { batchId, body } = parseShipForm(b.id, tripT, String(b.onWarehouseKg), "");
        await apiPostJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
      }
    },
    onSuccess: () => {
      invalidateDomain();
      setDistShipBatchIds(null);
      clearDistributionShipPayload();
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
      <p style={muted}>
        <strong>Порядок:</strong> партии создаются только из{" "}
        <Link to={ops.purchaseNakladnaya} style={{ fontWeight: 600 }}>
          накладной
        </Link>{" "}
        (строка = калибр = партия, товар сразу на складе). Здесь — рейс: отгрузка в рейс (<strong>кг</strong> обязательно;
        <strong>ящики</strong> при отгрузке — по желанию, дополнительно к накладной), при необходимости недостача по приёмке
        на рынке, продажа с рейса.
      </p>

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
      {batchesQuery.isPending && <LoadingBlock label="Загрузка партий и остатков…" minHeight={96} />}

      {!batchesQuery.isPending && batchesQuery.data && (
        <>
          <BatchesByNakladnayaReference
            batches={batchesQuery.data.batches}
            isLoading={false}
            sectionHeadingId="op-batches-heading"
            showBulkExpandControls={false}
          />
          {batchesGroupedCount > 0 && user && canManageInventoryCatalog(user) && (
            <p style={{ ...muted, fontSize: "0.86rem", margin: "-0.35rem 0 0.9rem" }}>
              Подробная <strong>справочная</strong> сводка с «развернуть все» — в кабинете{" "}
              <Link to={`${adminRoutes.inventory}#batches-nakl-ref`} style={{ fontWeight: 600 }}>
                Склады и калибры
              </Link>{" "}
              (с кнопками «развернуть/свернуть все»).
            </p>
          )}
        </>
      )}

      {tripsQuery.isError && (
        <p style={warnText}>Список рейсов не загрузился — выберите рейс вручную или повторите позже.</p>
      )}

      <section className="birzha-panel" aria-labelledby="op-sec-ship">
        <h3 id="op-sec-ship" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          1. Отгрузить в рейс
        </h3>
        <p style={muted}>
          {hasDistributionSelection ? (
            <>
              Вы пришли из <strong>Распределения</strong>: ниже отгружается <strong>один собранный отбор</strong> (свод по
              калибрам). Ручные блоки «Одна партия» и «Вся накладная» скрыты, чтобы не дублировать сценарий.
            </>
          ) : (
            <>
              Отгрузка снимает массу <strong>с выбранной партии</strong> (строки накладной, калибр). Сначала выберите рейс,
              затем либо одну партию и кг, либо отгрузите все строки накладной, где есть остаток на складе.
            </>
          )}
        </p>
        <label htmlFor="op-sel-ship-trip" style={{ fontSize: "0.88rem" }}>
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

        {!hasDistributionSelection && (
          <>
            <h4 style={{ margin: "0 0 0.35rem", fontSize: "0.92rem", fontWeight: 600 }}>Одна партия (накладная · калибр)</h4>
        <label htmlFor="op-sel-ship-batch" style={{ fontSize: "0.88rem" }}>
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
          <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.85rem" }}>
            Нет партий с остатком на складе — нечего отгружать (сначала оформите приём по накладной на вкладке{" "}
            <Link to={ops.purchaseNakladnaya}>Накладная</Link>).
          </p>
        )}
        <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.82rem" }}>
          В выпадающем списке — только партии с остатком на складе. Ниже можно ввести или вставить идентификатор партии
          из таблицы выше (в т.ч. если нужна партия не из списка).
        </p>
        <label htmlFor="op-in-ship-batch-id" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.35rem" }}>
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
        <label htmlFor="op-in-ship-kg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
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
        <label htmlFor="op-in-ship-pkg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
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
        <p style={{ ...muted, fontSize: "0.85rem", marginBottom: "0.35rem" }}>
          Отправка <strong>по накладной</strong> в выбранный рейс: по очереди фиксируется отгрузка по каждой строке (калибр),{" "}
          <strong>кг</strong> = полный остаток на складе по строке. Можно указать <strong>всего ящиков по накладной</strong> в
          этой отгрузке — они <strong>распределяются по строкам пропорционально кг</strong> (сумма в отчёте рейса по ящикам =
          введённое число). Нужны ящики иначе — отгрузите строки по одной в блоке выше.
        </p>
        <label htmlFor="op-sel-ship-naklad-all" style={{ fontSize: "0.88rem" }}>
          Накладная
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
          <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.82rem" }}>
            <Link to={purchaseNakladnayaDocumentPath(shipAllDocumentId)}>Открыть накладную</Link>
          </p>
        ) : null}
        <label htmlFor="op-in-ship-naklad-pkg-total" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
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
        )}

        {distShipBatchIds != null && distShipBatchIds.length > 0 && (
          <div className="no-print birzha-banner-distribution" role="region" aria-labelledby="dist-ship-h">
            <h4 id="dist-ship-h" style={{ fontSize: "0.9rem", margin: "0 0 0.4rem" }}>
              Отбор из «Распределения» → рейс
            </h4>
            <p style={{ ...muted, margin: "0 0 0.4rem", fontSize: "0.86rem", lineHeight: 1.5 }}>
              Перенесён список <strong>{distShipBatchIds.length}</strong> {distShipBatchIds.length === 1 ? "партии" : "партий"}.
              С <strong>остатком сейчас</strong> готово к отгрузке: <strong>{distBatchesToShip.length}</strong>. Для
              каждой будет отгружен полный остаток по партии, как в одиночной отгрузке. {distBatchesMissingCount > 0 && (
                <>
                  {" "}
                  {distBatchesMissingCount} из списка уже <strong>без остатка</strong> (часть увезли раньше) — в отгрузку не
                  пошли.
                </>
              )}
            </p>
            <p style={{ ...muted, fontSize: "0.8rem", margin: "0 0 0.4rem" }}>
              Сначала выберите <strong>рейс</strong> (создайте выше «Создать рейс», если его ещё нет), затем нажмите кнопку.
            </p>
            {distByCaliberSummary.length > 0 && (
              <p style={{ ...muted, fontSize: "0.8rem", margin: "0 0 0.4rem" }}>
                Свод по калибрам (одна сборная накладная):{" "}
                {distByCaliberSummary
                  .map((r) => `${r.line}: ${r.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`)
                  .join(" · ")}
                .
              </p>
            )}
            <p style={{ margin: "0.35rem 0 0" }}>
              <button
                type="button"
                style={btnStyle}
                disabled={shipFromDistribution.isPending || !shipTripId.trim() || distBatchesToShip.length === 0}
                aria-busy={shipFromDistribution.isPending || undefined}
                onClick={() => shipFromDistribution.mutate()}
              >
                {shipFromDistribution.isPending
                  ? "Отгрузка…"
                  : "Отгрузить весь отбор из «Распределения» в выбранный рейс"}
              </button>{" "}
              <button
                type="button"
                style={btnStyle}
                disabled={shipFromDistribution.isPending}
                onClick={() => {
                  setDistShipBatchIds(null);
                  clearDistributionShipPayload();
                }}
              >
                Сбросить отбор
              </button>{" "}
              <Link to={ops.distribution} style={{ fontSize: "0.86rem" }}>
                к распределению
              </Link>
            </p>
            <FieldError error={shipFromDistribution.error as Error | null} />
          </div>
        )}
      </section>

      <SellFromTripSection variant="operations" />

      <section className="birzha-panel" aria-labelledby="op-sec-short">
        <h3 id="op-sec-short" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          3. Недостача по рейсу (приёмка)
        </h3>
        <p style={muted}>Зафиксируйте недостачу при приёмке рейса: выберите партию, рейс, кг и причину.</p>
        <label htmlFor="op-in-short-batch" style={{ fontSize: "0.88rem" }}>
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
        <label htmlFor="op-sel-short-trip" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
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
        <label htmlFor="op-in-short-kg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
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
        <label htmlFor="op-in-short-reason" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
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
      </section>
    </div>
  );
}
