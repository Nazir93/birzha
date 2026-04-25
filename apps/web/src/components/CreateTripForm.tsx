import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiFetch } from "../api/fetch-api.js";
import { btnStyle, dateFieldStyleCompact, errorText, fieldStyleCompact, muted, successText } from "../ui/styles.js";
import { parseCreateTripForm } from "../validation/api-schemas.js";
import { BirzhaDateTimeField } from "./BirzhaCalendarFields.js";

export function CreateTripForm() {
  const queryClient = useQueryClient();
  const [tripNumber, setTripNumber] = useState("");
  const [tripId, setTripId] = useState("");
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [driverName, setDriverName] = useState("");
  const [departedAtLocal, setDepartedAtLocal] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const body = parseCreateTripForm(tripId, tripNumber, vehicleLabel, driverName, departedAtLocal);
      const res = await apiFetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ ok?: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
      setTripNumber("");
      setTripId("");
      setVehicleLabel("");
      setDriverName("");
      setDepartedAtLocal("");
    },
  });

  useEffect(() => {
    mutation.reset();
  }, [tripNumber, tripId, vehicleLabel, driverName, departedAtLocal, mutation]);

  return (
    <div style={{ marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid #e4e4e7" }}>
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>Создать рейс (POST /api/trips)</h3>
      <p style={{ ...muted, margin: "0 0 0.75rem" }}>
        Онлайн-вызов API (не через офлайн-очередь). ID можно оставить пустым — будет UUID. ТС, водитель и время —
        для «общей накладной» в отчёте рейса.
      </p>
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
        ID рейса (опционально)
      </label>
      <input
        id="ct-trip-id"
        value={tripId}
        onChange={(e) => setTripId(e.target.value)}
        placeholder="пусто = случайный UUID"
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
