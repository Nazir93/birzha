import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { counterpartiesFullListQueryOptions, queryRoots } from "../query/core-list-queries.js";
import { canWriteCounterpartyCatalog } from "../auth/role-panels.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, fieldStyle, muted, tableStyleDense, thHeadDense, thtdDense, warnText } from "../ui/styles.js";

/**
 * Справочник контрагентов: список, добавление и удаление (когда разрешено API и ролью).
 */
export function CounterpartiesPanel() {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = meta?.counterpartyCatalogApi === "enabled";
  const canWrite = user && canWriteCounterpartyCatalog(user);

  const [newName, setNewName] = useState("");

  const listQ = useQuery({ ...counterpartiesFullListQueryOptions(), enabled });

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

  if (!enabled) {
    return (
      <div role="region" aria-label="Справочник контрагентов">
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Контрагенты</h2>
        <p style={muted}>
          Справочник контрагентов временно недоступен. Обратитесь к администратору.
        </p>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Справочник контрагентов">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Контрагенты</h2>
      <p style={{ ...muted, marginTop: 0 }}>
        Продавец выбирает контрагента при продаже с рейса. Бухгалтерия ведёт список клиентов и покупателей.
      </p>

      {listQ.isError && <p style={warnText}>Список не загрузился.</p>}
      {listQ.isPending && <LoadingBlock label="Загрузка…" minHeight={72} />}

      {canWrite && !listQ.isPending && (
        <form
          style={{ marginBottom: "0.5rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!createM.isPending) {
              void createM.mutate();
            }
          }}
        >
          <label htmlFor="new-cp-name" style={{ fontSize: "0.88rem", display: "block", marginBottom: "0.35rem" }}>
            Новый контрагент
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
              style={btnStyle}
              disabled={createM.isPending || newName.trim().length === 0}
            >
              Добавить
            </button>
          </div>
        </form>
      )}

      {createM.isError && <p style={errorText}>{(createM.error as Error).message}</p>}
      {deleteM.isError && <p style={errorText}>{(deleteM.error as Error).message}</p>}

      {listQ.data && listQ.data.counterparties.length === 0 && !listQ.isPending && (
        <p style={muted}>Список пуст — добавьте контрагента{canWrite ? " выше" : " в кабинете с правом записи"}.</p>
      )}

      {listQ.data && listQ.data.counterparties.length > 0 && (
        <table style={{ ...tableStyleDense, marginTop: "0.75rem" }}>
          <thead>
            <tr>
              <th style={thHeadDense}>Название</th>
              {canWrite ? <th style={thHeadDense}> </th> : null}
            </tr>
          </thead>
          <tbody>
            {listQ.data.counterparties
              .slice()
              .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"))
              .map((c) => (
                <tr key={c.id}>
                  <th scope="row" style={thtdDense}>
                    {c.displayName}
                  </th>
                  {canWrite ? (
                    <td style={thtdDense}>
                      <button
                        type="button"
                        style={{ ...btnStyle, fontSize: "0.85rem", padding: "0.25rem 0.5rem" }}
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
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
