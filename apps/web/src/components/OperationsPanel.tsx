import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../api/fetch-api.js";
import type {
  BatchListItem,
  BatchesListResponse,
  CounterpartiesListResponse,
  ShipmentReportResponse,
  TripsListResponse,
} from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import { buildTripBatchRows, type TripBatchTableRow } from "../format/trip-report-rows.js";
import { useAuth } from "../auth/auth-context.js";
import {
  btnStyle,
  errorText,
  fieldStyle,
  muted,
  sectionBox,
  successText,
  tableStyleDense,
  thHeadDense,
  thtdDense,
  warnText,
} from "../ui/styles.js";
import { purchaseNakladnayaDocumentPath, routes } from "../routes.js";
import { parseRecordTripShortageForm, parseSellFromTripForm, parseShipForm } from "../validation/api-schemas.js";

const selectWide = { ...fieldStyle, maxWidth: 420 };

/** Граммы → строка кг для подписей (целые граммы → десятичные кг без float). */
function gramsBigIntToKgDecimalString(g: bigint): string {
  if (g === 0n) {
    return "0";
  }
  const negative = g < 0n;
  const v = negative ? -g : g;
  const whole = v / 1000n;
  const rem = v % 1000n;
  if (rem === 0n) {
    return `${negative ? "-" : ""}${whole}`;
  }
  const frac = rem.toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

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

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

function useTripsOptions() {
  const q = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const res = await apiFetch("/api/trips");
      if (!res.ok) {
        throw new Error(`trips ${res.status}`);
      }
      return res.json() as Promise<TripsListResponse>;
    },
    retry: 1,
  });
  const options = (q.data?.trips ?? []).slice().sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru"));
  return { ...q, options };
}

function ErrorText({ e }: { e: Error | null }) {
  if (!e) {
    return null;
  }
  return (
    <p role="alert" style={errorText}>
      {e.message}
    </p>
  );
}

export function OperationsPanel() {
  const { meta } = useAuth();
  const queryClient = useQueryClient();
  const invalidateDomain = () => {
    void queryClient.invalidateQueries({ queryKey: ["shipment-report"] });
    void queryClient.invalidateQueries({ queryKey: ["batches"] });
  };

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

  const trips = useTripsOptions();

  const shippableBatches = useMemo(() => {
    const list = batchesQuery.data?.batches ?? [];
    return list.filter((b) => b.onWarehouseKg > 0).sort((a, b) => {
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

  /** Партии сгруппированы по накладной — в таблице не смешиваем документы в одной куче. */
  const batchesGrouped = useMemo(() => {
    const list = batchesQuery.data?.batches ?? [];
    const byDoc = new Map<string, BatchListItem[]>();
    const orphans: BatchListItem[] = [];
    for (const b of list) {
      const did = b.nakladnaya?.documentId;
      if (did) {
        if (!byDoc.has(did)) {
          byDoc.set(did, []);
        }
        byDoc.get(did)!.push(b);
      } else {
        orphans.push(b);
      }
    }
    const groups: {
      documentId: string;
      documentNumber: string | null;
      batches: BatchListItem[];
    }[] = [];
    for (const [documentId, batches] of byDoc) {
      const documentNumber = batches[0]?.nakladnaya?.documentNumber ?? null;
      batches.sort(
        (a, b) =>
          (a.nakladnaya?.productGradeCode ?? "").localeCompare(b.nakladnaya?.productGradeCode ?? "", "ru") ||
          a.id.localeCompare(b.id),
      );
      groups.push({ documentId, documentNumber, batches });
    }
    groups.sort((a, b) =>
      (a.documentNumber ?? "").localeCompare(b.documentNumber ?? "", "ru", { numeric: true }),
    );
    if (orphans.length > 0) {
      orphans.sort((a, b) => a.id.localeCompare(b.id));
      groups.push({
        documentId: "__orphan__",
        documentNumber: null,
        batches: orphans,
      });
    }
    return groups;
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

  const counterpartiesCatalog = meta?.counterpartyCatalogApi === "enabled";
  const counterpartiesQ = useQuery({
    queryKey: ["counterparties"],
    queryFn: async () => {
      const res = await apiFetch("/api/counterparties");
      if (!res.ok) {
        throw new Error(`counterparties ${res.status}`);
      }
      return res.json() as Promise<CounterpartiesListResponse>;
    },
    enabled: counterpartiesCatalog,
    retry: 1,
  });

  const [shipBatchId, setShipBatchId] = useState("");
  const [shipTripId, setShipTripId] = useState("");
  const [shipKg, setShipKg] = useState("");
  const [shipPackages, setShipPackages] = useState("");
  const [shipAllDocumentId, setShipAllDocumentId] = useState("");

  const ship = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseShipForm(shipBatchId, shipTripId, shipKg, shipPackages);
      await postJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
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
      const rows = shippableBatches.filter((b) => b.nakladnaya?.documentId === shipAllDocumentId);
      if (rows.length === 0) {
        throw new Error("Нет остатка на складе по строкам этой накладной");
      }
      for (const b of rows) {
        const { batchId, body } = parseShipForm(b.id, tripT, String(b.onWarehouseKg), "");
        await postJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
      }
    },
    onSuccess: () => {
      invalidateDomain();
      setShipAllDocumentId("");
    },
  });

  const [sellBatchId, setSellBatchId] = useState("");
  const [sellTripId, setSellTripId] = useState("");
  const [sellKg, setSellKg] = useState("");
  const [saleId, setSaleId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [paymentKind, setPaymentKind] = useState<"cash" | "debt" | "mixed">("cash");
  const [cashMixed, setCashMixed] = useState("");
  const [sellClientLabel, setSellClientLabel] = useState("");
  const [sellCounterpartyId, setSellCounterpartyId] = useState("");
  const [newCounterpartyName, setNewCounterpartyName] = useState("");

  const sellTripIdTrim = sellTripId.trim();
  const sellReportQuery = useQuery({
    queryKey: ["shipment-report", sellTripIdTrim],
    queryFn: async () => {
      const res = await apiFetch(`/api/trips/${encodeURIComponent(sellTripIdTrim)}/shipment-report`);
      if (!res.ok) {
        throw new Error(`Отчёт рейса ${res.status}`);
      }
      return res.json() as Promise<ShipmentReportResponse>;
    },
    enabled: sellTripIdTrim.length > 0,
    retry: 1,
  });

  const batchByIdForSell = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesQuery.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesQuery.data?.batches]);

  const sellableOnTripRows = useMemo(() => {
    if (!sellReportQuery.data) {
      return [] as TripBatchTableRow[];
    }
    return buildTripBatchRows(sellReportQuery.data).filter((r) => r.netTransitG > 0n);
  }, [sellReportQuery.data]);

  const formatSellBatchOptionLabel = (row: TripBatchTableRow): string => {
    const b = batchByIdForSell.get(row.batchId);
    const line = b ? formatNakladLineLabel(b) : `Партия ${formatShortBatchId(row.batchId)}`;
    const docNum = b?.nakladnaya?.documentNumber?.trim();
    const prefix = docNum ? `№ ${docNum} · ` : "";
    const kg = gramsBigIntToKgDecimalString(row.netTransitG);
    return `${prefix}${line} — доступно ${kg} кг`;
  };

  const createCounterparty = useMutation({
    mutationFn: async () => {
      const displayName = newCounterpartyName.trim();
      if (!displayName) {
        throw new Error("Укажите название контрагента");
      }
      const j = await postJson("/api/counterparties", { displayName });
      return j as { counterparty: { id: string; displayName: string } };
    },
    onSuccess: async (data) => {
      setNewCounterpartyName("");
      setSellCounterpartyId(data.counterparty.id);
      await queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });

  const sell = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseSellFromTripForm({
        batchId: sellBatchId,
        tripId: sellTripId,
        kg: sellKg,
        saleId,
        pricePerKg: sellPrice,
        paymentKind,
        cashMixed,
        clientLabel: sellClientLabel,
        counterpartyId: sellCounterpartyId || undefined,
      });
      await postJson(`/api/batches/${encodeURIComponent(batchId)}/sell-from-trip`, body);
      return { saleId: body.saleId };
    },
    onSuccess: () => invalidateDomain(),
  });

  const [shortBatchId, setShortBatchId] = useState("");
  const [shortTripId, setShortTripId] = useState("");
  const [shortKg, setShortKg] = useState("");
  const [shortReason, setShortReason] = useState("");

  const shortage = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseRecordTripShortageForm(shortBatchId, shortTripId, shortKg, shortReason);
      await postJson(`/api/batches/${encodeURIComponent(batchId)}/record-trip-shortage`, body);
    },
    onSuccess: () => invalidateDomain(),
  });

  return (
    <div role="region" aria-label="Операции по партиям и рейсу">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Операции по партиям и рейсу</h2>
      <p style={muted}>
        <strong>Порядок:</strong> партии создаются только из{" "}
        <Link to={routes.purchaseNakladnaya} style={{ fontWeight: 600 }}>
          накладной
        </Link>{" "}
        (строка = калибр = партия, товар сразу на складе). Здесь — рейс: отгрузка в рейс (<strong>кг</strong> обязательно;
        <strong>ящики</strong> при отгрузке — по желанию, дополнительно к накладной), при необходимости недостача по приёмке
        на рынке, продажа с рейса.
      </p>

      {batchesQuery.data && (
        <datalist id="batch-suggestions">
          {batchesQuery.data.batches.map((b) => (
            <option key={b.id} value={b.id} />
          ))}
        </datalist>
      )}

      {batchesQuery.isError && <p style={warnText}>Список партий (GET /api/batches) не загрузился.</p>}

      {batchesQuery.data && batchesQuery.data.batches.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <p id="op-batches-heading" style={{ ...muted, marginBottom: "0.5rem" }}>
            <strong>Партии по накладным</strong> — каждый блок — один документ и его строки (калибры). Технический id партии
            нужен для API; в работе ориентируйтесь на <strong>номер накладной</strong> и <strong>товар / калибр</strong>.
          </p>
          {batchesGrouped.map((grp) => (
            <div key={grp.documentId} style={{ overflowX: "auto", marginBottom: "1rem" }}>
              <p
                style={{
                  ...muted,
                  marginBottom: "0.3rem",
                  fontWeight: 600,
                  fontSize: "0.92rem",
                }}
              >
                {grp.documentId === "__orphan__" ? (
                  <>Прочие партии (в системе нет привязки к строке накладной — старый или тестовый ввод)</>
                ) : (
                  <>
                    Накладная № {grp.documentNumber ?? "—"}{" "}
                    <Link
                      to={purchaseNakladnayaDocumentPath(grp.documentId)}
                      style={{ fontWeight: 400, fontSize: "0.88rem" }}
                    >
                      открыть документ
                    </Link>
                  </>
                )}
              </p>
              <table style={tableStyleDense} aria-labelledby="op-batches-heading">
                <thead>
                  <tr>
                    <th scope="col" style={thHeadDense}>
                      Товар / калибр
                    </th>
                    <th scope="col" style={thHeadDense}>
                      id партии
                    </th>
                    <th scope="col" style={thHeadDense}>
                      на складе, кг
                    </th>
                    <th scope="col" style={thHeadDense}>
                      в пути
                    </th>
                    <th scope="col" style={thHeadDense}>
                      продано
                    </th>
                    <th scope="col" style={thHeadDense}>
                      ожидает приёмки
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grp.batches.map((b) => (
                    <tr key={b.id}>
                      <td style={thtdDense}>{formatNakladLineLabel(b)}</td>
                      <td style={thtdDense}>
                        <code style={{ fontSize: "0.75rem" }} title={b.id}>
                          {formatShortBatchId(b.id)}
                        </code>
                      </td>
                      <td style={thtdDense}>{b.onWarehouseKg}</td>
                      <td style={thtdDense}>{b.inTransitKg}</td>
                      <td style={thtdDense}>{b.soldKg}</td>
                      <td style={thtdDense}>{b.pendingInboundKg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {trips.isError && (
        <p style={warnText}>Список рейсов не загрузился — выберите tripId вручную.</p>
      )}

      {counterpartiesCatalog && counterpartiesQ.isError && (
        <p style={warnText}>Справочник контрагентов (GET /api/counterparties) не загрузился.</p>
      )}

      <section style={sectionBox} aria-labelledby="op-sec-ship">
        <h3 id="op-sec-ship" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          1. Отгрузить в рейс
        </h3>
        <p style={muted}>
          POST /api/batches/:batchId/ship-to-trip — снимает массу <strong>с выбранной партии</strong> (строки накладной,
          калибр). Сначала выберите рейс, затем либо одну партию и кг, либо отгрузите все строки накладной, где есть
          остаток на складе.
        </p>
        <label htmlFor="op-sel-ship-trip" style={{ fontSize: "0.88rem" }}>
          Рейс (tripId) *
        </label>
        <select
          id="op-sel-ship-trip"
          value={shipTripId}
          onChange={(e) => setShipTripId(e.target.value)}
          style={{ ...selectWide, marginBottom: "0.75rem" }}
        >
          <option value="">— выберите рейс —</option>
          {trips.options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.tripNumber} ({t.status}) — {t.id}
            </option>
          ))}
        </select>

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
        >
          <option value="">— выберите партию —</option>
          {shippableBatches.map((b) => (
            <option key={b.id} value={b.id}>
              {formatBatchShipLabel(b)}
            </option>
          ))}
        </select>
        {shippableBatches.length === 0 && batchesQuery.data && (
          <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.85rem" }}>
            Нет партий с остатком на складе — нечего отгружать (сначала оформите приём по накладной на вкладке{" "}
            <Link to={routes.purchaseNakladnaya}>Накладная</Link>).
          </p>
        )}
        <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.82rem" }}>
          В выпадающем списке — только партии с остатком на складе. Ниже можно ввести или вставить batchId из таблицы
          выше (в т.ч. если нужна партия не из списка).
        </p>
        <label htmlFor="op-in-ship-batch-id" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.35rem" }}>
          batchId (дублирует выбор выше)
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
          placeholder="или вставьте UUID партии"
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
        <ErrorText e={ship.error as Error | null} />
        {ship.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}

        <h4 style={{ margin: "1rem 0 0.35rem", fontSize: "0.92rem", fontWeight: 600 }}>Вся накладная в рейс</h4>
        <p style={{ ...muted, fontSize: "0.85rem", marginBottom: "0.35rem" }}>
          По очереди отправляется отгрузка по каждой строке накладной, где на складе есть кг (полный остаток по строке).
          Ящики в этом режиме не передаются — при необходимости отгрузите строки по одной и укажите ящики выше.
        </p>
        <label htmlFor="op-sel-ship-naklad-all" style={{ fontSize: "0.88rem" }}>
          Накладная
        </label>
        <select
          id="op-sel-ship-naklad-all"
          value={shipAllDocumentId}
          onChange={(e) => setShipAllDocumentId(e.target.value)}
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
        <ErrorText e={shipAllFromNaklad.error as Error | null} />
        {shipAllFromNaklad.isSuccess && (
          <p style={successText} role="status">
            Все строки с остатком отгружены.
          </p>
        )}
      </section>

      <section style={sectionBox} aria-labelledby="op-sec-sell">
        <h3 id="op-sec-sell" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          2. Продать с рейса
        </h3>
        <p style={muted}>
          POST /api/batches/:batchId/sell-from-trip — сначала выберите <strong>рейс</strong>, затем{" "}
          <strong>партию (товар и калибр)</strong> с остатком на этом рейсе; кг по умолчанию подставляется весь доступный
          остаток (можно уменьшить).
        </p>
        <label htmlFor="op-sel-sell-trip" style={{ fontSize: "0.88rem" }}>
          Рейс *
        </label>
        <select
          id="op-sel-sell-trip"
          value={sellTripId}
          onChange={(e) => {
            const v = e.target.value;
            setSellTripId(v);
            setSellBatchId("");
            setSellKg("");
          }}
          style={{ ...selectWide, marginBottom: "0.5rem" }}
        >
          <option value="">— выберите рейс —</option>
          {trips.options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.tripNumber} ({t.status}) — {t.id}
            </option>
          ))}
        </select>
        {sellTripIdTrim && sellReportQuery.isFetching && (
          <p style={{ ...muted, marginTop: 0, marginBottom: "0.5rem" }} role="status">
            Загрузка остатков по рейсу…
          </p>
        )}
        {sellTripIdTrim && sellReportQuery.isError && (
          <p role="alert" style={{ ...warnText, marginTop: 0, marginBottom: "0.5rem" }}>
            Не удалось загрузить отчёт рейса (GET /api/trips/…/shipment-report). Продажа по списку недоступна — укажите
            batchId вручную ниже.
          </p>
        )}
        {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length === 0 && (
          <p style={{ ...warnText, marginTop: 0, marginBottom: "0.5rem" }}>
            На этом рейсе нет массы для продажи: не было отгрузок в рейс или весь товар уже продан / списан по недостаче.
          </p>
        )}
        <label htmlFor="op-sel-sell-batch-line" style={{ fontSize: "0.88rem" }}>
          Партия (товар / калибр, остаток на рейсе) *
        </label>
        <select
          id="op-sel-sell-batch-line"
          value={sellBatchId}
          onChange={(e) => {
            const id = e.target.value;
            setSellBatchId(id);
            const row = sellableOnTripRows.find((r) => r.batchId === id);
            if (row) {
              setSellKg(gramsBigIntToKgDecimalString(row.netTransitG));
            }
          }}
          style={{ ...selectWide, marginBottom: "0.35rem" }}
          disabled={
            !sellTripIdTrim ||
            (Boolean(sellTripIdTrim) && !sellReportQuery.isFetched) ||
            (sellReportQuery.isSuccess && sellableOnTripRows.length === 0) ||
            (sellReportQuery.isFetched && sellReportQuery.isError)
          }
        >
          <option value="">
            {!sellTripIdTrim
              ? "— сначала выберите рейс —"
              : !sellReportQuery.isFetched
                ? "… загрузка остатков …"
                : sellReportQuery.isError
                  ? "— отчёт не загрузился, batchId ниже —"
                  : "— выберите партию и калибр —"}
          </option>
          {sellableOnTripRows.map((row) => (
            <option key={row.batchId} value={row.batchId}>
              {formatSellBatchOptionLabel(row)}
            </option>
          ))}
        </select>
        <label htmlFor="op-in-sell-batch" style={{ fontSize: "0.88rem" }}>
          batchId (вручную, если список недоступен)
        </label>
        <input
          id="op-in-sell-batch"
          value={sellBatchId}
          onChange={(e) => setSellBatchId(e.target.value)}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
          placeholder="совпадает с выбором выше"
        />
        <label htmlFor="op-in-sell-kg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          kg *
        </label>
        <input
          id="op-in-sell-kg"
          value={sellKg}
          onChange={(e) => setSellKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <label htmlFor="op-in-sell-sale" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          saleId (опц., иначе UUID)
        </label>
        <input
          id="op-in-sell-sale"
          value={saleId}
          onChange={(e) => setSaleId(e.target.value)}
          style={fieldStyle}
          autoComplete="off"
        />
        <label htmlFor="op-in-sell-price" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          pricePerKg (руб/кг) *
        </label>
        <input
          id="op-in-sell-price"
          value={sellPrice}
          onChange={(e) => setSellPrice(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        {counterpartiesCatalog && (
          <>
            <label htmlFor="op-sel-sell-cp" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
              Контрагент (справочник)
            </label>
            <select
              id="op-sel-sell-cp"
              value={sellCounterpartyId}
              onChange={(e) => setSellCounterpartyId(e.target.value)}
              style={selectWide}
            >
              <option value="">— подпись вручную (ниже) —</option>
              {(counterpartiesQ.data?.counterparties ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <label htmlFor="op-in-new-cp" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
              Новый контрагент (POST /counterparties)
            </label>
            <input
              id="op-in-new-cp"
              value={newCounterpartyName}
              onChange={(e) => setNewCounterpartyName(e.target.value)}
              style={fieldStyle}
              placeholder="название"
              maxLength={200}
              autoComplete="off"
            />
            <button
              type="button"
              style={{ ...btnStyle, marginTop: "0.35rem" }}
              disabled={createCounterparty.isPending}
              onClick={() => createCounterparty.mutate()}
            >
              {createCounterparty.isPending ? "…" : "Добавить в справочник"}
            </button>
            <ErrorText e={createCounterparty.error as Error | null} />
          </>
        )}
        <label htmlFor="op-in-sell-client" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          Клиент вручную (опц., если не выбран справочник)
        </label>
        <input
          id="op-in-sell-client"
          value={sellClientLabel}
          onChange={(e) => setSellClientLabel(e.target.value)}
          style={fieldStyle}
          placeholder="например ИП Иванов"
          maxLength={120}
          autoComplete="off"
          disabled={Boolean(sellCounterpartyId)}
        />
        <label htmlFor="op-sel-sell-pay" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          paymentKind
        </label>
        <select
          id="op-sel-sell-pay"
          value={paymentKind}
          onChange={(e) => setPaymentKind(e.target.value as "cash" | "debt" | "mixed")}
          style={fieldStyle}
        >
          <option value="cash">cash — вся выручка наличными</option>
          <option value="debt">debt — вся выручка в долг</option>
          <option value="mixed">mixed — часть налом (cashKopecksMixed)</option>
        </select>
        {paymentKind === "mixed" && (
          <>
            <label htmlFor="op-in-sell-mixed" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
              cashKopecksMixed (копейки, строка цифр) *
            </label>
            <input
              id="op-in-sell-mixed"
              value={cashMixed}
              onChange={(e) => setCashMixed(e.target.value)}
              style={fieldStyle}
              placeholder="например 50000"
              inputMode="numeric"
              autoComplete="off"
            />
          </>
        )}
        <button
          type="button"
          style={btnStyle}
          disabled={sell.isPending}
          aria-busy={sell.isPending || undefined}
          onClick={() => sell.mutate()}
        >
          {sell.isPending ? "…" : "Продать"}
        </button>
        <ErrorText e={sell.error as Error | null} />
        {sell.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}
      </section>

      <section style={{ ...sectionBox, borderBottom: "none", marginBottom: 0, paddingBottom: 0 }} aria-labelledby="op-sec-short">
        <h3 id="op-sec-short" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          3. Недостача по рейсу (приёмка)
        </h3>
        <p style={muted}>POST /api/batches/:batchId/record-trip-shortage</p>
        <label htmlFor="op-in-short-batch" style={{ fontSize: "0.88rem" }}>
          batchId *
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
          tripId *
        </label>
        <select
          id="op-sel-short-trip"
          value={shortTripId}
          onChange={(e) => setShortTripId(e.target.value)}
          style={selectWide}
        >
          <option value="">— выберите рейс —</option>
          {trips.options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.tripNumber} ({t.status}) — {t.id}
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
          reason *
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
        <ErrorText e={shortage.error as Error | null} />
        {shortage.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}
      </section>
    </div>
  );
}
