import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiPostJson } from "../api/fetch-api.js";
import { queryRoots, tripsFieldSellerOptionsQueryOptions } from "../query/core-list-queries.js";
import { btnStyle, dateFieldStyleCompact, errorText, fieldStyleCompact, muted, successText } from "../ui/styles.js";
import { parseCreateTripForm } from "../validation/api-schemas.js";
import { BirzhaDateTimeField } from "./BirzhaCalendarFields.js";

export function CreateTripForm() {
  const queryClient = useQueryClient();
  const fieldSellersQuery = useQuery(tripsFieldSellerOptionsQueryOptions());
  const [tripNumber, setTripNumber] = useState("");
  const [tripId, setTripId] = useState("");
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [driverName, setDriverName] = useState("");
  const [departedAtLocal, setDepartedAtLocal] = useState("");
  const [assignedSellerUserId, setAssignedSellerUserId] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const body = parseCreateTripForm(
        tripId,
        tripNumber,
        vehicleLabel,
        driverName,
        departedAtLocal,
        assignedSellerUserId,
      );
      return apiPostJson("/api/trips", body) as Promise<{ ok?: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
      setTripNumber("");
      setTripId("");
      setVehicleLabel("");
      setDriverName("");
      setDepartedAtLocal("");
      setAssignedSellerUserId("");
    },
  });

  useEffect(() => {
    mutation.reset();
  }, [tripNumber, tripId, vehicleLabel, driverName, departedAtLocal, assignedSellerUserId, mutation]);

  return (
    <div className="birzha-panel">
      <h3 className="birzha-section-title birzha-section-title--sm">Создать рейс</h3>
      <label htmlFor="ct-trip-number" style={{ fontSize: "0.88rem" }}>
        Номер рейса *
      </label>
      <input
        id="ct-trip-number"
        value={tripNumber}
        onChange={(e) => setTripNumber(e.target.value)}
        placeholder="например Ф-2026-001"
        style={fieldStyleCompact}
        autoComplete="off"
      />
      <label htmlFor="ct-trip-id" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.65rem" }}>
        Идентификатор рейса (опционально)
      </label>
      <input
        id="ct-trip-id"
        value={tripId}
        onChange={(e) => setTripId(e.target.value)}
        placeholder="пусто = создать автоматически"
        style={fieldStyleCompact}
        autoComplete="off"
      />
      <label htmlFor="ct-vehicle" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.65rem" }}>
        ТС (номер и т.п., опционально)
      </label>
      <input
        id="ct-vehicle"
        value={vehicleLabel}
        onChange={(e) => setVehicleLabel(e.target.value)}
        placeholder="например А 123 ВС 77"
        style={fieldStyleCompact}
        autoComplete="off"
      />
      <label htmlFor="ct-driver" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.65rem" }}>
        Водитель, фамилия (опционально)
      </label>
      <input
        id="ct-driver"
        value={driverName}
        onChange={(e) => setDriverName(e.target.value)}
        placeholder="например Иванов"
        style={fieldStyleCompact}
        autoComplete="name"
      />
      <label htmlFor="ct-departed" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.65rem" }}>
        План/факт отправления (локальные дата и время, опционально)
      </label>
      <BirzhaDateTimeField
        id="ct-departed"
        value={departedAtLocal}
        onChange={setDepartedAtLocal}
        style={dateFieldStyleCompact}
        className="birzha-input-date"
        emptyLabel="— не задано —"
      />
      <label htmlFor="ct-assigned-seller" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.65rem" }}>
        Продавец в поле (опционально, можно назначить позже)
      </label>
      <select
        id="ct-assigned-seller"
        value={assignedSellerUserId}
        onChange={(e) => setAssignedSellerUserId(e.target.value)}
        style={{ ...fieldStyleCompact, maxWidth: "100%" }}
        disabled={fieldSellersQuery.isPending}
      >
        <option value="">— пока не показывать продавцам —</option>
        {(fieldSellersQuery.data?.fieldSellers ?? []).map((u) => (
          <option key={u.id} value={u.id}>
            {u.login}
          </option>
        ))}
      </select>
      {fieldSellersQuery.isError && (
        <p role="alert" style={{ ...errorText, fontSize: "0.85rem", marginTop: "0.35rem" }}>
          Список продавцов не загрузился: {(fieldSellersQuery.error as Error).message}. Можно создать рейс без
          закрепления или проверьте права (нужна роль логиста / руководителя).
        </p>
      )}
      {fieldSellersQuery.isSuccess &&
        (fieldSellersQuery.data?.fieldSellers?.length ?? 0) === 0 &&
        !fieldSellersQuery.isPending && (
          <p style={{ ...muted, fontSize: "0.85rem", marginTop: "0.35rem" }}>
            Нет активных продавцов для закрепления рейса — администратор должен создать отдельные учётные записи продавцов.
          </p>
        )}
      <div>
        <button
          type="button"
          style={btnStyle}
          disabled={mutation.isPending}
          aria-busy={mutation.isPending ? true : undefined}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Создание…" : "Создать рейс"}
        </button>
      </div>
      {mutation.isError && (
        <p role="alert" style={errorText}>
          {(mutation.error as Error).message}
        </p>
      )}
      {mutation.isSuccess && (
        <p style={successText} role="status">
          Рейс создан. Список обновлён.
        </p>
      )}
    </div>
  );
}
