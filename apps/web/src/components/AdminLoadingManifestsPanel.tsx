import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiPostJson } from "../api/fetch-api.js";
import { loadingManifestDetailQueryOptions, loadingManifestsListQueryOptions, tripsFullListQueryOptions } from "../query/core-list-queries.js";
import { adminRoutes } from "../routes.js";
import { CreateTripIfAllowed } from "./CreateTripIfAllowed.js";
import { LoadingBlock } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, muted, tableStyle, thHead, thtd } from "../ui/styles.js";

type CaliberRow = { key: string; label: string; kg: number; packageCount: number };

function caliberRows(lines: { kg: number; packageCount: string | null; productGroup: string | null; productGradeCode: string | null }[]): CaliberRow[] {
  const acc = new Map<string, CaliberRow>();
  for (const line of lines) {
    const label = `${line.productGroup?.trim() || "Товар"} · ${line.productGradeCode?.trim() || "—"}`;
    const key = label;
    const packageCount = line.packageCount ? Number(line.packageCount) : 0;
    const prev = acc.get(key);
    if (prev) {
      prev.kg += line.kg;
      prev.packageCount += Number.isFinite(packageCount) ? packageCount : 0;
      continue;
    }
    acc.set(key, {
      key,
      label,
      kg: line.kg,
      packageCount: Number.isFinite(packageCount) ? packageCount : 0,
    });
  }
  return [...acc.values()].sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

export function AdminLoadingManifestsPanel() {
  const { manifestId = "" } = useParams();
  const queryClient = useQueryClient();
  const [assignTripId, setAssignTripId] = useState("");
  const listQuery = useQuery(loadingManifestsListQueryOptions());
  const detailQuery = useQuery(loadingManifestDetailQueryOptions(manifestId));
  const tripsQuery = useQuery(tripsFullListQueryOptions());

  const tripNumberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tripsQuery.data?.trips ?? []) {
      m.set(t.id, t.tripNumber);
    }
    return m;
  }, [tripsQuery.data?.trips]);

  const detail = detailQuery.data?.manifest;
  const caliberSummary = useMemo(() => (detail ? caliberRows(detail.lines) : []), [detail]);

  const assignTrip = useMutation({
    mutationFn: async () => {
      if (!manifestId.trim() || !assignTripId.trim()) {
        throw new Error("Выберите рейс для привязки.");
      }
      await apiPostJson(`/api/loading-manifests/${encodeURIComponent(manifestId)}/assign-trip`, { tripId: assignTripId.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["loading-manifest"] });
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });

  return (
    <section className="birzha-card" aria-labelledby="admin-loading-manifests-h">
      <h2 id="admin-loading-manifests-h" style={{ margin: "0 0 0.65rem", fontSize: "1.08rem" }}>
        Погрузка
      </h2>
      <p style={{ ...muted, marginTop: 0, marginBottom: "0.7rem" }}>
        Здесь рейсы и погрузочные накладные: после распределения закрепляйте накладную за рейсом.
      </p>

      <div className="birzha-home-work-card no-print" style={{ marginBottom: "0.9rem" }}>
        <h3 style={{ margin: "0 0 0.55rem", fontSize: "0.98rem" }}>Рейсы</h3>
        <CreateTripIfAllowed />
        <div className="birzha-table-scroll" style={{ marginTop: "0.55rem" }}>
          <table style={{ ...tableStyle, minWidth: 560 }}>
            <thead>
              <tr>
                <th style={thHead}>Рейс</th>
                <th style={thHead}>Статус</th>
                <th style={thHead}>Машина</th>
                <th style={thHead}>Отчёт</th>
              </tr>
            </thead>
            <tbody>
              {(tripsQuery.data?.trips ?? []).map((t) => (
                <tr key={t.id}>
                  <td style={thtd}>{t.tripNumber}</td>
                  <td style={thtd}>{t.status}</td>
                  <td style={thtd}>{t.vehicleLabel ?? "—"}</td>
                  <td style={thtd}>
                    <Link to={`${adminRoutes.reports}?trip=${encodeURIComponent(t.id)}`}>Открыть</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {listQuery.isPending ? <LoadingBlock label="Загрузка списка накладных…" minHeight={80} /> : null}
      {listQuery.isError ? (
        <p style={errorText} role="alert">
          Не удалось загрузить список погрузочных накладных.
        </p>
      ) : null}

      {listQuery.data && (
        <div className="birzha-table-scroll" style={{ marginBottom: "0.9rem" }}>
          <table style={{ ...tableStyle, minWidth: 760 }}>
            <thead>
              <tr>
                <th style={thHead}>Номер</th>
                <th style={thHead}>Дата</th>
                <th style={thHead}>Склад</th>
                <th style={thHead}>Город</th>
                <th style={thHead}>Рейс</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.loadingManifests.map((m) => (
                <tr key={m.id}>
                  <td style={thtd}>
                    <Link to={`${adminRoutes.loadingManifests}/${encodeURIComponent(m.id)}`}>№ {m.manifestNumber}</Link>
                  </td>
                  <td style={thtd}>{m.docDate}</td>
                  <td style={thtd}>
                    {m.warehouseName} ({m.warehouseCode})
                  </td>
                  <td style={thtd}>{m.destinationName}</td>
                  <td style={thtd}>{m.tripId ? tripNumberById.get(m.tripId) ?? m.tripId : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manifestId && detailQuery.isPending ? <LoadingBlock label="Загрузка накладной…" minHeight={72} /> : null}
      {manifestId && detailQuery.isError ? (
        <p style={errorText} role="alert">
          Не удалось загрузить выбранную накладную.
        </p>
      ) : null}

      {detail ? (
        <div className="loading-manifest-print" style={{ marginTop: "0.7rem" }}>
          <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>№ {detail.manifestNumber}</h3>
          <p style={{ ...muted, marginTop: 0 }}>
            {detail.docDate} · {detail.warehouseName} ({detail.warehouseCode}) · {detail.destinationName}
          </p>
          <div className="no-print" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.7rem" }}>
            <select
              value={assignTripId}
              onChange={(e) => setAssignTripId(e.target.value)}
              style={{ minWidth: "16rem" }}
            >
              <option value="">— выбрать рейс —</option>
              {(tripsQuery.data?.trips ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tripNumber} · {t.status}
                </option>
              ))}
            </select>
            <button type="button" style={btnStyle} disabled={assignTrip.isPending || !assignTripId} onClick={() => assignTrip.mutate()}>
              {assignTrip.isPending ? "Привязка…" : "Привязать к рейсу"}
            </button>
            <span style={muted}>
              Текущий рейс: {detail.tripId ? tripNumberById.get(detail.tripId) ?? detail.tripId : "не назначен"}
            </span>
          </div>
          {assignTrip.isError ? (
            <p style={errorText} role="alert">
              {(assignTrip.error as Error).message}
            </p>
          ) : null}
          <div className="birzha-table-scroll" style={{ marginBottom: "0.75rem" }}>
            <table style={{ ...tableStyle, minWidth: 540 }}>
              <thead>
                <tr>
                  <th style={thHead}>Калибр</th>
                  <th style={thHead}>Кг</th>
                  <th style={thHead}>Ящ.</th>
                </tr>
              </thead>
              <tbody>
                {caliberSummary.map((row) => (
                  <tr key={row.key}>
                    <td style={thtd}>{row.label}</td>
                    <td style={thtd}>{row.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>
                    <td style={thtd}>{row.packageCount > 0 ? row.packageCount.toLocaleString("ru-RU") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="birzha-table-scroll">
            <table style={{ ...tableStyle, minWidth: 740 }}>
              <thead>
                <tr>
                  <th style={thHead}>Строка</th>
                  <th style={thHead}>Калибр</th>
                  <th style={thHead}>Партия</th>
                  <th style={thHead}>Кг</th>
                  <th style={thHead}>Ящ.</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.batchId}>
                    <td style={thtd}>{line.lineNo}</td>
                    <td style={thtd}>{`${line.productGroup?.trim() || "Товар"} · ${line.productGradeCode?.trim() || "—"}`}</td>
                    <td style={thtd}>{line.batchId.slice(0, 8)}…</td>
                    <td style={thtd}>{line.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>
                    <td style={thtd}>{line.packageCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: "0.8rem" }}>
            <button type="button" style={btnStyle} onClick={() => window.print()}>
              Печать
            </button>
          </p>
        </div>
      ) : (
        <p style={{ ...muted, marginTop: 0 }}>Выберите накладную из списка выше.</p>
      )}
    </section>
  );
}
