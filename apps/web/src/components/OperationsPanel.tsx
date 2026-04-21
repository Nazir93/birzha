import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../api/fetch-api.js";
import type { BatchesListResponse, CounterpartiesListResponse, TripsListResponse } from "../api/types.js";
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
import { routes } from "../routes.js";
import {
  parseCreateBatchForm,
  parseReceiveForm,
  parseRecordTripShortageForm,
  parseSellFromTripForm,
  parseShipForm,
} from "../validation/api-schemas.js";

const selectWide = { ...fieldStyle, maxWidth: 420 };

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

  const [batchIdIn, setBatchIdIn] = useState("");
  const [purchaseIdIn, setPurchaseIdIn] = useState("");
  const [totalKg, setTotalKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [distribution, setDistribution] = useState<"awaiting_receipt" | "on_hand">("awaiting_receipt");

  const createBatch = useMutation({
    mutationFn: async () => {
      const body = parseCreateBatchForm({
        batchId: batchIdIn,
        purchaseId: purchaseIdIn,
        totalKg,
        pricePerKg,
        distribution,
      });
      await postJson("/api/batches", body);
      return { id: body.id, purchaseId: body.purchaseId };
    },
    onSuccess: (data) => {
      setBatchIdIn(data.id);
      setPurchaseIdIn(data.purchaseId);
      invalidateDomain();
    },
  });

  useEffect(() => {
    createBatch.reset();
  }, [batchIdIn, purchaseIdIn, totalKg, pricePerKg, distribution, createBatch]);

  const [recvBatchId, setRecvBatchId] = useState("");
  const [recvKg, setRecvKg] = useState("");

  const receive = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseReceiveForm(recvBatchId, recvKg);
      await postJson(`/api/batches/${encodeURIComponent(batchId)}/receive-on-warehouse`, body);
    },
    onSuccess: () => invalidateDomain(),
  });

  const [shipBatchId, setShipBatchId] = useState("");
  const [shipTripId, setShipTripId] = useState("");
  const [shipKg, setShipKg] = useState("");
  const [shipPackages, setShipPackages] = useState("");

  const ship = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseShipForm(shipBatchId, shipTripId, shipKg, shipPackages);
      await postJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
    },
    onSuccess: () => invalidateDomain(),
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
        <strong>Порядок в учёте:</strong> сначала на вкладке{" "}
        <Link to={routes.purchaseNakladnaya} style={{ fontWeight: 600 }}>
          Накладная
        </Link>{" "}
        фиксируют приём на склад — появляются партии. Здесь — рейс, отгрузка в рейс (<strong>кг</strong> обязательно;
        <strong>ящики</strong> при отгрузке — по желанию в форме ниже, дополнительно к ящикам в накладной), при
        необходимости недостача по приёмке на рынке, продажа с рейса.
      </p>
      <p style={muted}>
        Ниже — прямые вызовы REST (как в `register-batch-routes`). ID партии и закупки при ручном создании партии можно
        задать вручную или сгенерировать пустыми полями.
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
        <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
          <p id="op-batches-heading" style={{ ...muted, marginBottom: "0.35rem" }}>
            Партии (GET /api/batches), кг
          </p>
          <table style={tableStyleDense} aria-labelledby="op-batches-heading">
            <thead>
              <tr>
                <th scope="col" style={thHeadDense}>
                  id
                </th>
                <th scope="col" style={thHeadDense}>
                  накладная
                </th>
                <th scope="col" style={thHeadDense}>
                  калибр
                </th>
                <th scope="col" style={thHeadDense}>
                  склад
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
              {batchesQuery.data.batches.map((b) => (
                <tr key={b.id}>
                  <td style={thtdDense}>
                    <code style={{ fontSize: "0.78rem" }}>{b.id}</code>
                  </td>
                  <td style={thtdDense}>{b.nakladnaya?.documentNumber ?? "—"}</td>
                  <td style={thtdDense}>{b.nakladnaya?.productGradeCode ?? "—"}</td>
                  <td style={thtdDense}>{b.onWarehouseKg}</td>
                  <td style={thtdDense}>{b.inTransitKg}</td>
                  <td style={thtdDense}>{b.soldKg}</td>
                  <td style={thtdDense}>{b.pendingInboundKg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trips.isError && (
        <p style={warnText}>Список рейсов не загрузился — выберите tripId вручную.</p>
      )}

      {counterpartiesCatalog && counterpartiesQ.isError && (
        <p style={warnText}>Справочник контрагентов (GET /api/counterparties) не загрузился.</p>
      )}

      <section style={sectionBox} aria-labelledby="op-sec-create">
        <h3 id="op-sec-create" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          1. Создать партию (закупку)
        </h3>
        <p style={muted}>POST /api/batches</p>
        <label htmlFor="op-in-create-batch" style={{ fontSize: "0.88rem" }}>
          ID партии (опц.)
        </label>
        <input
          id="op-in-create-batch"
          value={batchIdIn}
          onChange={(e) => setBatchIdIn(e.target.value)}
          style={fieldStyle}
          placeholder="UUID"
          list="batch-suggestions"
          autoComplete="off"
        />
        <label htmlFor="op-in-create-purchase" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          ID закупки (опц.)
        </label>
        <input
          id="op-in-create-purchase"
          value={purchaseIdIn}
          onChange={(e) => setPurchaseIdIn(e.target.value)}
          style={fieldStyle}
          autoComplete="off"
        />
        <label htmlFor="op-in-create-total" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          totalKg *
        </label>
        <input
          id="op-in-create-total"
          value={totalKg}
          onChange={(e) => setTotalKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <label htmlFor="op-in-create-price" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          pricePerKg (руб/кг) *
        </label>
        <input
          id="op-in-create-price"
          value={pricePerKg}
          onChange={(e) => setPricePerKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <label htmlFor="op-sel-create-dist" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          distribution
        </label>
        <select
          id="op-sel-create-dist"
          value={distribution}
          onChange={(e) => setDistribution(e.target.value as "awaiting_receipt" | "on_hand")}
          style={fieldStyle}
        >
          <option value="awaiting_receipt">awaiting_receipt — ждёт оприходования</option>
          <option value="on_hand">on_hand — сразу на складе</option>
        </select>
        <button
          type="button"
          style={btnStyle}
          disabled={createBatch.isPending}
          aria-busy={createBatch.isPending || undefined}
          onClick={() => createBatch.mutate()}
        >
          {createBatch.isPending ? "Отправка…" : "Создать партию"}
        </button>
        <ErrorText e={createBatch.error as Error | null} />
        {createBatch.isSuccess && (
          <p style={successText} role="status">
            Ок. Используйте этот batchId в следующих шагах: <code>{batchIdIn}</code>
          </p>
        )}
      </section>

      <section style={sectionBox} aria-labelledby="op-sec-receive">
        <h3 id="op-sec-receive" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          2. Оприходовать на склад
        </h3>
        <p style={muted}>POST /api/batches/:batchId/receive-on-warehouse</p>
        <label htmlFor="op-in-recv-batch" style={{ fontSize: "0.88rem" }}>
          batchId *
        </label>
        <input
          id="op-in-recv-batch"
          value={recvBatchId}
          onChange={(e) => setRecvBatchId(e.target.value)}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
        />
        <label htmlFor="op-in-recv-kg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          kg *
        </label>
        <input
          id="op-in-recv-kg"
          value={recvKg}
          onChange={(e) => setRecvKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <button
          type="button"
          style={btnStyle}
          disabled={receive.isPending}
          aria-busy={receive.isPending || undefined}
          onClick={() => receive.mutate()}
        >
          {receive.isPending ? "…" : "Оприходовать"}
        </button>
        <ErrorText e={receive.error as Error | null} />
        {receive.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}
      </section>

      <section style={sectionBox} aria-labelledby="op-sec-ship">
        <h3 id="op-sec-ship" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          3. Отгрузить в рейс
        </h3>
        <p style={muted}>POST /api/batches/:batchId/ship-to-trip</p>
        <label htmlFor="op-in-ship-batch" style={{ fontSize: "0.88rem" }}>
          batchId *
        </label>
        <input
          id="op-in-ship-batch"
          value={shipBatchId}
          onChange={(e) => setShipBatchId(e.target.value)}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
        />
        <label htmlFor="op-sel-ship-trip" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          tripId *
        </label>
        <select
          id="op-sel-ship-trip"
          value={shipTripId}
          onChange={(e) => setShipTripId(e.target.value)}
          style={selectWide}
        >
          <option value="">— выберите рейс —</option>
          {trips.options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.tripNumber} ({t.status}) — {t.id}
            </option>
          ))}
        </select>
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
          style={btnStyle}
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
      </section>

      <section style={sectionBox} aria-labelledby="op-sec-sell">
        <h3 id="op-sec-sell" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          4. Продать с рейса
        </h3>
        <p style={muted}>POST /api/batches/:batchId/sell-from-trip</p>
        <label htmlFor="op-in-sell-batch" style={{ fontSize: "0.88rem" }}>
          batchId *
        </label>
        <input
          id="op-in-sell-batch"
          value={sellBatchId}
          onChange={(e) => setSellBatchId(e.target.value)}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
        />
        <label htmlFor="op-sel-sell-trip" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          tripId *
        </label>
        <select
          id="op-sel-sell-trip"
          value={sellTripId}
          onChange={(e) => setSellTripId(e.target.value)}
          style={selectWide}
        >
          <option value="">— выберите рейс —</option>
          {trips.options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.tripNumber} ({t.status}) — {t.id}
            </option>
          ))}
        </select>
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
          5. Недостача по рейсу (приёмка)
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
