import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { counterpartiesFullListQueryOptions, queryRoots } from "../query/core-list-queries.js";
import { canWriteCounterpartyCatalog } from "../auth/role-panels.js";
import { kopecksToRubLabel } from "../format/money.js";
import { accounting } from "../routes.js";
import { AccountingSuppliersNakladnayaPanel } from "./AccountingSuppliersNakladnayaPanel.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { ErrorAlert, WarningAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, fieldStyle, tableStyleDense, thHeadDense, thtdDense } from "../ui/styles.js";

type CounterpartiesTab = "clients" | "suppliers";

type ReceivableRow = {
  counterpartyId: string | null;
  remainingKopecks: string;
  status: "open" | "closed";
};

/**
 * Контрагенты бухгалтерии: клиенты (справочник продаж) и тепличники с закупочными накладными.
 */
export function CounterpartiesPanel() {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = meta?.counterpartyCatalogApi === "enabled";
  const canWrite = user && canWriteCounterpartyCatalog(user);
  const [tab, setTab] = useState<CounterpartiesTab>("suppliers");
  const [newName, setNewName] = useState("");

  const listQ = useQuery({ ...counterpartiesFullListQueryOptions(), enabled: enabled && tab === "clients" });

  const recvQ = useQuery({
    queryKey: ["accounting", "receivables", "all-for-cp"],
    queryFn: async () => {
      const res = await apiFetch("/api/accounting/receivables?status=open");
      await assertOkResponse(res);
      return (await res.json()) as { receivables: ReceivableRow[] };
    },
    enabled: enabled && tab === "clients",
  });

  const debtByCp = useMemo(() => {
    const m = new Map<string, bigint>();
    for (const r of recvQ.data?.receivables ?? []) {
      if (!r.counterpartyId) {
        continue;
      }
      m.set(r.counterpartyId, (m.get(r.counterpartyId) ?? 0n) + BigInt(r.remainingKopecks || "0"));
    }
    return m;
  }, [recvQ.data]);

  const createM = useMutation({
    mutationFn: async () => {
      const displayName = newName.trim();
      if (!displayName) {
        throw new Error("Введите название");
      }
      await apiPostJson("/api/counterparties", { displayName });
    },
    onSuccess: async () => {
      setNewName("");
      await queryClient.invalidateQueries({ queryKey: queryRoots.counterparties });
    },
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/counterparties/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.status === 404 || res.status === 405) {
        throw new Error("Удаление на этом стенде недоступно");
      }
      await assertOkResponse(res);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryRoots.counterparties });
    },
  });

  return (
    <div role="region" aria-label="Контрагенты">
      <h2 style={{ margin: "0 0 0.65rem", fontSize: "1.1rem" }}>Контрагенты</h2>

      <div
        role="tablist"
        aria-label="Разделы контрагентов"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", marginBottom: "0.85rem" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "suppliers"}
          className={tab === "suppliers" ? "birzha-clean-ops-text-btn" : "birzha-text-muted"}
          style={{ fontWeight: tab === "suppliers" ? 700 : 500, border: "none", background: "none", cursor: "pointer" }}
          onClick={() => setTab("suppliers")}
        >
          Тепличники
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "clients"}
          className={tab === "clients" ? "birzha-clean-ops-text-btn" : "birzha-text-muted"}
          style={{ fontWeight: tab === "clients" ? 700 : 500, border: "none", background: "none", cursor: "pointer" }}
          onClick={() => setTab("clients")}
        >
          Клиенты
        </button>
      </div>

      {tab === "suppliers" ? <AccountingSuppliersNakladnayaPanel /> : null}

      {tab === "clients" ? (
        !enabled ? (
          <p className="birzha-callout-warning" role="status">
            Справочник клиентов временно недоступен. Обратитесь к администратору.
          </p>
        ) : (
          <>
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.75rem", maxWidth: "40rem" }}>
              Остаток долга — открытая дебиторка. Провести оплату:{" "}
              <Link to={accounting.receivables}>Дебиторка</Link>.
            </p>
            {canWrite && !listQ.isPending ? (
              <BirzhaDisclosure
                nested
                defaultOpen
                title={<span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Новый клиент</span>}
              >
                <form
                  style={{ marginBottom: 0 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!createM.isPending) {
                      void createM.mutate();
                    }
                  }}
                >
                  <label
                    htmlFor="new-cp-name"
                    className="birzha-form-label birzha-form-label--block birzha-form-label--mb-sm"
                  >
                    Название
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      id="new-cp-name"
                      name="newCounterparty"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      style={{ ...fieldStyle, minWidth: 220, flex: "1 1 12rem" }}
                      placeholder="Название"
                      maxLength={500}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className={btnClassSpaced}
                      disabled={createM.isPending || newName.trim().length === 0}
                    >
                      Добавить
                    </button>
                  </div>
                </form>
              </BirzhaDisclosure>
            ) : null}

            <BirzhaDisclosure
              nested
              defaultOpen
              title={<span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Список клиентов</span>}
            >
              {listQ.isError ? <WarningAlert title="Список">Список не загрузился.</WarningAlert> : null}
              {recvQ.isError ? <WarningAlert title="Долги">Остатки долга не загрузились.</WarningAlert> : null}
              {listQ.isPending && <LoadingBlock label="Загрузка…" minHeight={72} skeleton skeletonRows={5} />}

              {createM.isError ? <ErrorAlert error={createM.error} title="Создание" /> : null}
              {deleteM.isError ? <ErrorAlert error={deleteM.error} title="Удаление" /> : null}

              {listQ.data && listQ.data.counterparties.length === 0 && !listQ.isPending && (
                <BirzhaEmptyState compact title="Список пуст" />
              )}

              {listQ.data && listQ.data.counterparties.length > 0 && (
                <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                  <table style={{ ...tableStyleDense, marginTop: listQ.isPending ? 0 : "0.35rem" }}>
                    <thead>
                      <tr>
                        <th style={thHeadDense}>Название</th>
                        <th style={{ ...thHeadDense, textAlign: "right" }}>Остаток долга, ₽</th>
                        {canWrite ? <th style={thHeadDense}> </th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {listQ.data.counterparties
                        .slice()
                        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"))
                        .map((c) => {
                          const debt = debtByCp.get(c.id) ?? 0n;
                          return (
                            <tr key={c.id}>
                              <th scope="row" style={thtdDense}>
                                {c.displayName}
                              </th>
                              <td style={{ ...thtdDense, textAlign: "right", fontWeight: debt > 0n ? 600 : 400 }}>
                                {debt > 0n ? kopecksToRubLabel(debt.toString()) : "—"}
                              </td>
                              {canWrite ? (
                                <td style={thtdDense}>
                                  <button
                                    type="button"
                                    className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                                    style={{ fontSize: "0.85rem" }}
                                    disabled={deleteM.isPending}
                                    onClick={() => {
                                      if (window.confirm(`Удалить «${c.displayName}»?`)) {
                                        void deleteM.mutate(c.id);
                                      }
                                    }}
                                  >
                                    Удалить
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </BirzhaDisclosure>
          </>
        )
      ) : null}
    </div>
  );
}
