import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiPostJson } from "../api/fetch-api.js";
import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripSelectLabel, formatTripStatusLabel } from "../format/trip-label.js";
import {
  batchesFullListQueryOptions,
  queryRoots,
  shipmentReportQueryOptions,
  tripsFieldSellerOptionsQueryOptions,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { btnStyle, fieldStyle, muted, successText, tableStyle, thHead, thtd, warnText } from "../ui/styles.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };
const SELLER_ASSIGN_ROLES = ["admin", "manager", "purchaser", "logistics"] as const;

type AdminUserRow = { id: string; login: string; isActive: boolean; roleCodes: string[] };

function hasGlobalRole(user: { roles: { roleCode: string; scopeType: string; scopeId: string }[] } | null, role: string): boolean {
  if (!user) {
    return false;
  }
  return user.roles.some((r) => r.roleCode === role && r.scopeType === "global" && r.scopeId === "");
}

function shipmentProductLabel(
  report: ShipmentReportResponse | undefined,
  batchById: Map<string, BatchListItem>,
  isPending: boolean,
): string {
  if (isPending) {
    return "…";
  }
  if (!report) {
    return "—";
  }
  const codes = new Set<string>();
  for (const row of report.shipment.byBatch) {
    const b = batchById.get(row.batchId);
    const code = b?.nakladnaya?.productGradeCode?.trim();
    if (code) {
      codes.add(code);
    }
  }
  if (codes.size === 0) {
    return report.shipment.byBatch.length === 0 ? "—" : "…";
  }
  return [...codes].sort((a, b) => a.localeCompare(b, "ru")).join(", ");
}

export function SellerDispatchPanel() {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const tripsQuery = useQuery(tripsFullListQueryOptions());
  const batchesQuery = useQuery(batchesFullListQueryOptions());
  const canAssignSeller = SELLER_ASSIGN_ROLES.some((r) => hasGlobalRole(user, r));
  const fieldSellersQuery = useQuery({
    ...tripsFieldSellerOptionsQueryOptions(),
    enabled: canAssignSeller,
  });
  const canManageUsers = hasGlobalRole(user, "admin") || hasGlobalRole(user, "manager");
  const showAdminUsersApi = meta?.adminUsersApi === "enabled" && user != null;

  const sellerUsersQuery = useQuery({
    queryKey: ["admin-users", "sellers-only"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/users");
      await assertOkResponse(res, "GET /api/admin/users");
      const data = (await res.json()) as { users: AdminUserRow[] };
      return data.users.filter((x) => x.roleCodes.includes("seller"));
    },
    enabled: canManageUsers && showAdminUsersApi,
  });

  const tripSelectOptions = useMemo(
    () => sortTripsByTripNumberAsc(tripsQuery.data?.trips ?? []),
    [tripsQuery.data?.trips],
  );

  const sellerLoginById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sellerUsersQuery.data ?? []) {
      m.set(s.id, s.login);
    }
    for (const s of fieldSellersQuery.data?.fieldSellers ?? []) {
      m.set(s.id, s.login);
    }
    for (const t of tripSelectOptions) {
      if (t.assignedSellerUserId && !m.has(t.assignedSellerUserId)) {
        m.set(t.assignedSellerUserId, t.assignedSellerUserId);
      }
    }
    return m;
  }, [fieldSellersQuery.data?.fieldSellers, sellerUsersQuery.data, tripSelectOptions]);

  const sellerOptions = useMemo(() => {
    return [...sellerLoginById.entries()]
      .map(([id, login]) => ({ id, login }))
      .sort((a, b) => a.login.localeCompare(b.login, "ru"));
  }, [sellerLoginById]);

  const [assignTripId, setAssignTripId] = useState("");
  const [assignSellerUserId, setAssignSellerUserId] = useState("");
  const [newSellerLogin, setNewSellerLogin] = useState("");
  const [newSellerPassword, setNewSellerPassword] = useState("");

  const batchById = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesQuery.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesQuery.data?.batches]);

  const overviewReports = useQueries({
    queries: tripSelectOptions.map((trip) => ({
      ...shipmentReportQueryOptions(trip.id),
    })),
  });

  const assignSellerToTrip = useMutation({
    mutationFn: async () => {
      const tripId = assignTripId.trim();
      const sellerUserId = assignSellerUserId.trim();
      if (!tripId) {
        throw new Error("Выберите рейс");
      }
      if (!sellerUserId) {
        throw new Error("Выберите продавца");
      }
      await apiPostJson(`/api/trips/${encodeURIComponent(tripId)}/assign-seller`, { sellerUserId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
      void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    },
  });

  const createSellerMutation = useMutation({
    mutationFn: async () => {
      const login = newSellerLogin.trim();
      const password = newSellerPassword;
      if (!login) {
        throw new Error("Введите логин продавца");
      }
      if (password.length < 10) {
        throw new Error("Пароль должен быть не короче 10 символов");
      }
      await apiPostJson("/api/admin/users", { login, password, roleCode: "seller" });
    },
    onSuccess: () => {
      setNewSellerLogin("");
      setNewSellerPassword("");
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.trips, "field-seller-options"] });
    },
  });

  return (
    <div role="region" aria-label="Отгрузка">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Отгрузка</h2>
      <p style={{ ...muted, margin: "0 0 0.75rem", fontSize: "0.88rem" }}>
        Какой продавец закреплён за каким рейсом и какой товар на рейсе по данным отгрузки.
      </p>

      <section className="birzha-panel" aria-labelledby="dispatch-sec-sellers">
        <div className="birzha-section-heading">
          <div>
            <h3 id="dispatch-sec-sellers" className="birzha-section-title birzha-section-title--sm">
              Продавцы
            </h3>
          </div>
          <p className="birzha-section-heading__note">Создание учётной записи продавца</p>
        </div>
        {canManageUsers && showAdminUsersApi ? (
          <div className="birzha-form-grid birzha-form-grid--actions">
            <label style={{ fontSize: "0.88rem" }}>
              Логин нового продавца
              <input
                value={newSellerLogin}
                onChange={(e) => setNewSellerLogin(e.target.value)}
                style={{ ...fieldStyle, display: "block", marginTop: "0.2rem", minWidth: "12rem" }}
                autoComplete="off"
              />
            </label>
            <label style={{ fontSize: "0.88rem" }}>
              Пароль (от 10 символов)
              <input
                type="password"
                value={newSellerPassword}
                onChange={(e) => setNewSellerPassword(e.target.value)}
                style={{ ...fieldStyle, display: "block", marginTop: "0.2rem", minWidth: "12rem" }}
                autoComplete="new-password"
              />
            </label>
            <button
              type="button"
              style={btnStyle}
              disabled={createSellerMutation.isPending || !newSellerLogin.trim() || newSellerPassword.length < 10}
              onClick={() => createSellerMutation.mutate()}
            >
              {createSellerMutation.isPending ? "Создание…" : "Создать продавца"}
            </button>
          </div>
        ) : null}
        <FieldError error={createSellerMutation.error as Error | null} />
        {createSellerMutation.isSuccess ? (
          <p style={successText} role="status">
            Продавец создан.
          </p>
        ) : null}
      </section>

      {canAssignSeller ? (
        <section className="birzha-panel" aria-labelledby="dispatch-sec-assign">
          <div className="birzha-section-heading">
            <div>
              <h3 id="dispatch-sec-assign" className="birzha-section-title birzha-section-title--sm">
                Привязка рейса к продавцу
              </h3>
            </div>
            <p className="birzha-section-heading__note">Рейс будет виден только этому продавцу</p>
          </div>
          <label htmlFor="dispatch-seller" style={{ fontSize: "0.88rem", display: "block" }}>
            Продавец *
          </label>
          <select
            id="dispatch-seller"
            value={assignSellerUserId}
            onChange={(e) => setAssignSellerUserId(e.target.value)}
            style={{ ...selectWide, marginBottom: "0.45rem" }}
            disabled={sellerOptions.length === 0}
          >
            <option value="">{sellerOptions.length === 0 ? "— нет продавцов —" : "— выберите продавца —"}</option>
            {sellerOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.login}
              </option>
            ))}
          </select>

          <label htmlFor="dispatch-trip" style={{ fontSize: "0.88rem" }}>
            Рейс *
          </label>
          {tripsQuery.isPending ? (
            <p style={{ margin: "0.15rem 0 0.35rem" }} role="status" aria-live="polite">
              <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
            </p>
          ) : null}
          <select
            id="dispatch-trip"
            value={assignTripId}
            onChange={(e) => setAssignTripId(e.target.value)}
            style={selectWide}
            disabled={tripsQuery.isPending}
          >
            <option value="">{tripsQuery.isPending ? "— загрузка рейсов —" : "— выберите рейс —"}</option>
            {tripSelectOptions.map((t) => {
              const assigned = t.assignedSellerUserId ? sellerLoginById.get(t.assignedSellerUserId) ?? t.assignedSellerUserId : null;
              return (
                <option key={t.id} value={t.id}>
                  {formatTripSelectLabel(t)}
                  {assigned ? ` · продавец: ${assigned}` : ""}
                </option>
              );
            })}
          </select>
          {fieldSellersQuery.isError ? (
            <p role="alert" style={{ ...warnText, marginTop: "0.35rem", fontSize: "0.86rem" }}>
              Список продавцов не загрузился.
            </p>
          ) : null}
          {fieldSellersQuery.isSuccess && (fieldSellersQuery.data?.fieldSellers.length ?? 0) === 0 ? (
            <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.86rem" }}>Активных продавцов нет.</p>
          ) : null}

          <button
            type="button"
            style={{ ...btnStyle, marginTop: "0.5rem" }}
            disabled={assignSellerToTrip.isPending}
            aria-busy={assignSellerToTrip.isPending || undefined}
            onClick={() => assignSellerToTrip.mutate()}
          >
            {assignSellerToTrip.isPending ? "Сохранение…" : "Закрепить рейс за продавцом"}
          </button>
          <FieldError error={assignSellerToTrip.error as Error | null} />
          {assignSellerToTrip.isSuccess ? (
            <p style={successText} role="status">
              Рейс закреплён за продавцом.
            </p>
          ) : null}
        </section>
      ) : (
        <section className="birzha-panel" aria-labelledby="dispatch-sec-assign-readonly">
          <div className="birzha-section-heading">
            <div>
              <h3 id="dispatch-sec-assign-readonly" className="birzha-section-title birzha-section-title--sm">
                Привязка рейса к продавцу
              </h3>
            </div>
          </div>
          <p style={muted}>
            В бухгалтерии доступен просмотр. Назначение рейса делает администратор, руководитель, закупщик или логист.
          </p>
        </section>
      )}

      <section className="birzha-panel" aria-labelledby="dispatch-sec-matrix">
        <div className="birzha-section-heading">
          <div>
            <h3 id="dispatch-sec-matrix" className="birzha-section-title birzha-section-title--sm">
              Рейсы: продавец и товар
            </h3>
          </div>
          <p className="birzha-section-heading__note">По всем рейсам; товар — калибры из партий в отгрузке по рейсу</p>
        </div>
        {tripsQuery.isPending ? (
          <p style={{ margin: 0 }} role="status">
            <LoadingIndicator size="sm" label="Загрузка рейсов…" />
          </p>
        ) : (
          <div className="birzha-table-scroll">
            <table style={{ ...tableStyle, minWidth: 720 }} aria-label="Рейсы и закрепление">
              <thead>
                <tr>
                  <th scope="col" style={thHead}>
                    Рейс
                  </th>
                  <th scope="col" style={thHead}>
                    Статус
                  </th>
                  <th scope="col" style={thHead}>
                    Продавец
                  </th>
                  <th scope="col" style={thHead}>
                    Товар (калибр)
                  </th>
                </tr>
              </thead>
              <tbody>
                {tripSelectOptions.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={thtd}>
                      Рейсов пока нет.
                    </td>
                  </tr>
                ) : (
                  tripSelectOptions.map((t, i) => {
                    const rq = overviewReports[i];
                    const seller =
                      t.assignedSellerUserId != null
                        ? (sellerLoginById.get(t.assignedSellerUserId) ?? t.assignedSellerUserId)
                        : "—";
                    const product = shipmentProductLabel(rq?.data, batchById, rq?.isPending ?? false);
                    return (
                      <tr key={t.id}>
                        <td style={thtd}>{formatTripSelectLabel(t)}</td>
                        <td style={thtd}>{formatTripStatusLabel(t.status)}</td>
                        <td style={thtd}>{seller}</td>
                        <td style={thtd}>{product}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
