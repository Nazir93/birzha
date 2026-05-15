import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { formatTripSelectLabel } from "../format/trip-label.js";
import { isTripOpenForSellerWorkspace } from "../format/seller-workspace-trips.js";
import { tripByIdQueryOptions, tripsSearchPickerQueryOptions } from "../query/core-list-queries.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { btnStyle, fieldStyle } from "../ui/styles.js";

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Подбор рейса с поиском и ограниченной выборкой (`GET /api/trips?search=&limit=&order=`).
 */
export function TripSearchPicker({
  idPrefix,
  value,
  onChange,
  disabled,
  /** Упрощённые подписи для кабинета продавца (закреплённые рейсы). */
  sellerWorkspace,
}: {
  idPrefix: string;
  value: string;
  onChange: (tripId: string) => void;
  disabled?: boolean;
  sellerWorkspace?: boolean;
}) {
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebouncedValue(searchText, 280);

  const pickerQuery = useQuery(tripsSearchPickerQueryOptions(debouncedSearch));

  const selectedDetailQuery = useQuery(tripByIdQueryOptions(value));

  const mergedTrips = useMemo(() => {
    const fromPicker = pickerQuery.data?.trips ?? [];
    const extra = selectedDetailQuery.data?.trip;
    if (!extra) {
      return fromPicker;
    }
    if (fromPicker.some((t) => t.id === extra.id)) {
      return fromPicker;
    }
    return [extra, ...fromPicker];
  }, [pickerQuery.data?.trips, selectedDetailQuery.data?.trip]);

  const visibleTrips = useMemo(
    () => (sellerWorkspace ? mergedTrips.filter(isTripOpenForSellerWorkspace) : mergedTrips),
    [mergedTrips, sellerWorkspace],
  );

  const selectedTrip = visibleTrips.find((t) => t.id === value) ?? selectedDetailQuery.data?.trip;
  const selectedTripOpen =
    selectedTrip && (!sellerWorkspace || isTripOpenForSellerWorkspace(selectedTrip)) ? selectedTrip : undefined;

  useEffect(() => {
    if (!sellerWorkspace || !value || !selectedTrip) {
      return;
    }
    if (isTripOpenForSellerWorkspace(selectedTrip)) {
      return;
    }
    onChange("");
  }, [sellerWorkspace, value, selectedTrip, onChange]);

  const searchInputId = `${idPrefix}-trip-search`;

  return (
    <div className="birzha-trip-search-picker">
      {value && selectedTripOpen ? (
        <div style={{ marginBottom: "0.45rem" }}>
          <p className="birzha-callout-info" style={{ margin: "0 0 0.35rem", fontSize: "0.9rem", lineHeight: 1.45 }}>
            {sellerWorkspace ? "Сейчас продаём с рейса: " : "Выбран рейс: "}
            <strong>{formatTripSelectLabel(selectedTripOpen)}</strong>
          </p>
          <button
            type="button"
            className="birzha-ui-sm"
            style={{ ...btnStyle, padding: "0.45rem 0.75rem" }}
            disabled={disabled}
            onClick={() => {
              onChange("");
              setSearchText("");
            }}
          >
            Сменить рейс
          </button>
        </div>
      ) : (
        <>
          <label
            htmlFor={searchInputId}
            className="birzha-form-label birzha-form-label--block birzha-form-label--mb-xs"
          >
            {sellerWorkspace ? "Мой рейс" : "Поиск по номеру рейса"}
          </label>
          {sellerWorkspace && (
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.35rem", lineHeight: 1.45 }}>
              В списке только открытые рейсы, закреплённые за вами. Закрытые рейсы — в разделе «Отчёты по рейсу».
            </p>
          )}
          <input
            id={searchInputId}
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={sellerWorkspace ? "Найти по номеру рейса…" : "Введите часть номера…"}
            style={{ ...fieldStyle, maxWidth: "100%", marginBottom: "0.35rem" }}
            disabled={disabled}
            autoComplete="off"
            enterKeyHint="search"
          />
          {pickerQuery.isFetching && (
            <p style={{ margin: "0 0 0.35rem" }} role="status">
              <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
            </p>
          )}
          {pickerQuery.isError && (
            <p role="alert" className="birzha-ui-sm birzha-text-danger" style={{ margin: "0 0 0.35rem" }}>
              Не удалось загрузить рейсы.
            </p>
          )}
          <ul
            className="birzha-scroll-panel birzha-trip-search-picker__list"
            role="listbox"
            aria-label="Список рейсов"
            style={{ listStyle: "none", margin: 0, padding: "0.35rem 0.45rem" }}
          >
            {visibleTrips.map((t) => (
              <li key={t.id} role="none">
                <button
                  type="button"
                  role="option"
                  className="birzha-trip-search-picker__option"
                  disabled={disabled}
                  style={{
                    ...btnStyle,
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    fontWeight: value === t.id ? 700 : 500,
                    marginBottom: "0.25rem",
                  }}
                  onClick={() => {
                    onChange(t.id);
                    setSearchText("");
                  }}
                >
                  {formatTripSelectLabel(t)}
                </button>
              </li>
            ))}
          </ul>
          {!pickerQuery.isPending && visibleTrips.length === 0 && (
            <BirzhaEmptyState
              compact
              title="Нет рейсов"
              description={
                sellerWorkspace
                  ? "За вами не закреплено ни одного рейса — обратитесь к администратору или измените поиск."
                  : "Измените поиск или сбросьте фильтр."
              }
            />
          )}
        </>
      )}
    </div>
  );
}
