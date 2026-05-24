import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  filterWholesalersForSellerPicker,
  WHOLESALER_SELLER_MAX_ROWS,
} from "../format/wholesaler-picker.js";
import { wholesalersFullListQueryOptions } from "../query/core-list-queries.js";
import { BirzhaAlert } from "../ui/BirzhaAlert.js";
import { humanizeErrorMessage } from "../format/user-facing-error.js";

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Выбор оптовика: поиск + список (как в форме продажи у продавца). */
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
  const [search, setSearch] = useState("");
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

  const selectedName = useMemo(() => {
    if (!value) {
      return "";
    }
    const w = (wholesalersQ.data?.wholesalers ?? []).find((x) => x.id === value);
    return w?.name ?? fallbackLabel?.trim() ?? "";
  }, [value, wholesalersQ.data?.wholesalers, fallbackLabel]);

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
        onChange={(e) => setSearch(e.target.value)}
        className="birzha-seller-form-control"
        style={{ marginBottom: "0.45rem", maxWidth: "100%" }}
        placeholder={
          activeWholesalers.length > 0
            ? activeWholesalers.length > WHOLESALER_SELLER_MAX_ROWS
              ? "Поиск по имени…"
              : "Поиск или выберите ниже"
            : "Название оптовика…"
        }
        aria-label="Поиск оптовика"
        autoComplete="off"
      />
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
              Активных оптовиков нет — их добавляет администратор в разделе «Инвентарь».
            </li>
          ) : picker.rows.length === 0 ? (
            <li className="birzha-text-muted" style={{ padding: "0.5rem 0.65rem", fontSize: "0.88rem" }}>
              Нет совпадений по поиску — измените запрос.
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
