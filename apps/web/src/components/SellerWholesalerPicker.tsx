import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { apiPostJsonOr403 } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { canCreateWholesaler } from "../auth/role-panels.js";
import {
  filterWholesalersForSellerPicker,
  wholesalerCreateNameFromSearch,
  WHOLESALER_SELLER_MAX_ROWS,
} from "../format/wholesaler-picker.js";
import { humanizeErrorMessage } from "../format/user-facing-error.js";
import { queryRoots, wholesalersFullListQueryOptions } from "../query/core-list-queries.js";
import { BirzhaAlert } from "../ui/BirzhaAlert.js";

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Выбор оптовика: поиск + список + добавление нового (продавец / руководство). */
export function SellerWholesalerPicker({
  value,
  onChange,
  idPrefix,
  enabled = true,
  /** Подпись из строки продажи, если оптовик снят с активных. */
  fallbackLabel,
}: {
  value: string;
  onChange: (wholesalerId: string) => void;
  idPrefix: string;
  enabled?: boolean;
  fallbackLabel?: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = canCreateWholesaler(user);
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const searchDebounced = useDebouncedValue(search, 220);

  const wholesalersQ = useQuery({
    ...wholesalersFullListQueryOptions(),
    enabled,
  });

  const activeWholesalers = useMemo(
    () => (wholesalersQ.data?.wholesalers ?? []).filter((w) => w.isActive),
    [wholesalersQ.data?.wholesalers],
  );

  const picker = useMemo(() => {
    const qSource = searchDebounced;
    return filterWholesalersForSellerPicker(activeWholesalers, qSource, value);
  }, [activeWholesalers, searchDebounced, value]);

  const createName = useMemo(
    () => (canCreate ? wholesalerCreateNameFromSearch(search, activeWholesalers) : null),
    [canCreate, search, activeWholesalers],
  );

  const selectedName = useMemo(() => {
    if (!value) {
      return "";
    }
    const w = (wholesalersQ.data?.wholesalers ?? []).find((x) => x.id === value);
    return w?.name ?? fallbackLabel?.trim() ?? "";
  }, [value, wholesalersQ.data?.wholesalers, fallbackLabel]);

  const createM = useMutation({
    mutationFn: async (name: string) => {
      setCreateError(null);
      const res = (await apiPostJsonOr403(
        "/api/wholesalers",
        { name },
        "Нет прав на добавление оптовика",
      )) as { wholesaler: { id: string; name: string } };
      return res.wholesaler;
    },
    onSuccess: async (w) => {
      setSearch("");
      onChange(w.id);
      await queryClient.invalidateQueries({ queryKey: queryRoots.wholesalers });
    },
    onError: (e: Error) => {
      setCreateError(humanizeErrorMessage(e));
    },
  });

  if (!enabled) {
    return (
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }}>
        Справочник оптовиков недоступен.
      </p>
    );
  }

  return (
    <div role="region" aria-labelledby={`${idPrefix}-wholesale-h`}>
      <span id={`${idPrefix}-wholesale-h`} className="birzha-form-label birzha-form-label--block" style={{ marginBottom: "0.35rem" }}>
        Оптовик *
      </span>
      <input
        value={search}
        onChange={(e) => {
          setCreateError(null);
          setSearch(e.target.value);
        }}
        className="birzha-seller-form-control"
        style={{ marginBottom: "0.45rem", maxWidth: "100%" }}
        placeholder={
          activeWholesalers.length > 0
            ? activeWholesalers.length > WHOLESALER_SELLER_MAX_ROWS
              ? "Поиск или новое имя…"
              : "Поиск, выбор или новое имя"
            : "Название нового оптовика…"
        }
        aria-label="Поиск или название оптовика"
        autoComplete="off"
      />
      {canCreate && createName ? (
        <div style={{ marginBottom: "0.45rem" }}>
          <button
            type="button"
            className="birzha-btn-primary"
            style={{ width: "100%", maxWidth: "100%" }}
            disabled={createM.isPending}
            aria-busy={createM.isPending ? true : undefined}
            onClick={() => void createM.mutate(createName)}
          >
            {createM.isPending ? "Добавление…" : `Добавить «${createName}»`}
          </button>
        </div>
      ) : null}
      {createError ? (
        <BirzhaAlert variant="error" title="Оптовик">
          {createError}
        </BirzhaAlert>
      ) : null}
      {search.trim() !== searchDebounced.trim() ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.35rem" }}>
          Поиск…
        </p>
      ) : null}
      {wholesalersQ.isPending ? (
        <p className="birzha-text-muted birzha-ui-sm">Загрузка списка оптовиков…</p>
      ) : wholesalersQ.isError ? (
        <BirzhaAlert variant="error" title="Список оптовиков">
          {humanizeErrorMessage(wholesalersQ.error)}
        </BirzhaAlert>
      ) : (
        <ul className="birzha-seller-wholesaler-list" aria-label="Наши оптовики">
          {activeWholesalers.length === 0 ? (
            <li className="birzha-text-muted" style={{ padding: "0.5rem 0.65rem", fontSize: "0.88rem" }}>
              {canCreate
                ? "Пока нет оптовиков — введите название выше и нажмите «Добавить»."
                : "Активных оптовиков нет — их добавляет администратор или продавец."}
            </li>
          ) : picker.rows.length === 0 ? (
            <li className="birzha-text-muted" style={{ padding: "0.5rem 0.65rem", fontSize: "0.88rem" }}>
              {canCreate && createName
                ? "Нет совпадений — можно добавить нового оптовика кнопкой выше."
                : "Нет совпадений по поиску — измените запрос."}
            </li>
          ) : (
            picker.rows.map((w) => (
              <li key={w.id} className="birzha-seller-wholesaler-list__item">
                <button
                  type="button"
                  onClick={() => onChange(w.id)}
                  className={
                    value === w.id
                      ? "birzha-seller-wholesaler-list__pick birzha-seller-wholesaler-list__pick--active"
                      : "birzha-seller-wholesaler-list__pick"
                  }
                >
                  {w.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {picker.truncated ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.35rem 0 0" }}>
          Показаны первые {WHOLESALER_SELLER_MAX_ROWS} из {picker.totalMatched} — уточните поиск.
        </p>
      ) : null}
      {selectedName ? (
        <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0.45rem 0 0" }}>
          <strong>{selectedName}</strong>
        </p>
      ) : null}
    </div>
  );
}
