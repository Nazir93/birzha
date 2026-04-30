import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { formatTripSelectLabel } from "../format/trip-label.js";
import { tripByIdQueryOptions, tripsSearchPickerQueryOptions } from "../query/core-list-queries.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";
import { btnStyle, fieldStyle, muted } from "../ui/styles.js";

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
}: {
  idPrefix: string;
  value: string;
  onChange: (tripId: string) => void;
  disabled?: boolean;
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

  const selectedTrip = mergedTrips.find((t) => t.id === value) ?? selectedDetailQuery.data?.trip;

  const searchInputId = `${idPrefix}-trip-search`;

  return (
    <div className="birzha-trip-search-picker">
      {value && selectedTrip ? (
        <div style={{ marginBottom: "0.45rem" }}>
          <p style={{ ...muted, margin: "0 0 0.35rem", fontSize: "0.9rem", lineHeight: 1.45 }}>
            Выбран рейс: <strong>{formatTripSelectLabel(selectedTrip)}</strong>
          </p>
          <button
            type="button"
            style={{ ...btnStyle, fontSize: "0.88rem", padding: "0.45rem 0.75rem" }}
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
          <label htmlFor={searchInputId} style={{ fontSize: "0.88rem", display: "block", marginBottom: "0.25rem" }}>
            Поиск по номеру рейса
          </label>
          <input
            id={searchInputId}
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Введите часть номера…"
            style={{ ...fieldStyle, maxWidth: "100%", marginBottom: "0.35rem" }}
            disabled={disabled}
            autoComplete="off"
            enterKeyHint="search"
          />
          {pickerQuery.isFetching && (
            <p style={{ ...muted, margin: "0 0 0.35rem" }} role="status">
              <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
            </p>
          )}
          {pickerQuery.isError && (
            <p role="alert" style={{ color: "var(--birzha-danger)", margin: "0 0 0.35rem", fontSize: "0.88rem" }}>
              Не удалось загрузить рейсы.
            </p>
          )}
          <ul
            className="birzha-scroll-panel birzha-trip-search-picker__list"
            role="listbox"
            aria-label="Список рейсов"
            style={{ listStyle: "none", margin: 0, padding: "0.35rem 0.45rem" }}
          >
            {mergedTrips.map((t) => (
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
          {!pickerQuery.isPending && mergedTrips.length === 0 && (
            <p style={{ ...muted, margin: 0, fontSize: "0.86rem" }}>Нет рейсов по запросу — измените поиск.</p>
          )}
        </>
      )}
    </div>
  );
}
