import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiPostJson } from "../api/fetch-api.js";
import { apiFetch, assertOkResponse } from "../api/fetch-api.js";
import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { filterTripsInWork } from "../format/archive.js";
import { filterTripsWithoutAssignedSeller } from "../format/seller-trip-metrics.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripSelectLabel, formatTripStatusLabel } from "../format/trip-label.js";
import { resolveUserLogin } from "../format/user-display.js";
import {
  batchesFullListQueryOptions,
  queryRoots,
  shipmentReportQueryOptions,
  tripsFieldSellerOptionsQueryOptions,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { btnStyle, fieldStyle, successText, tableStyle, thHead, thtd, warnText } from "../ui/styles.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingBlock, LoadingIndicator } from "../ui/LoadingIndicator.js";

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
    () => sortTripsByTripNumberAsc(filterTripsInWork(tripsQuery.data?.trips ?? [])),
    [tripsQuery.data?.trips],
  );

  /** Уже закреплённые за продавцом рейсы нельзя выбрать повторно — только свободные. */
  const tripsAvailableForAssignment = useMemo(
    () => filterTripsWithoutAssignedSeller(tripSelectOptions),
    [tripSelectOptions],
  );

  const sellerLoginById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sellerUsersQuery.data ?? []) {
      m.set(s.id, s.login);
    }
    for (const s of fieldSellersQuery.data?.fieldSellers ?? []) {
      m.set(s.id, s.login);
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
      setAssignTripId("");
      void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
      void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    },
  });

  return (
    <div role="region" aria-label="Отгрузка">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Отгрузка</h2>

      {canAssignSeller ? (
        <BirzhaDisclosure
          defaultOpen
          title={
            <h3 id="dispatch-sec-assign" className="birzha-section-title birzha-section-title--sm" style={{ margin: 0 }}>
              Привязка рейса к продавцу
            </h3>
          }
        >
          <label htmlFor="dispatch-seller" className="birzha-form-label birzha-form-label--block">
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

          <label htmlFor="dispatch-trip" className="birzha-form-label">
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
            <option value="">
              {tripsQuery.isPending
                ? "— загрузка рейсов —"
                : tripsAvailableForAssignment.length === 0
                  ? "— нет свободных рейсов —"
                  : "— выберите рейс —"}
            </option>
            {tripsAvailableForAssignment.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTripSelectLabel(t)}
              </option>
            ))}
          </select>
          {fieldSellersQuery.isError ? (
            <p role="alert" style={{ ...warnText, marginTop: "0.35rem", fontSize: "0.86rem" }}>
              Список продавцов не загрузился.
            </p>
          ) : null}
          {fieldSellersQuery.isSuccess && (fieldSellersQuery.data?.fieldSellers.length ?? 0) === 0 ? (
            <BirzhaEmptyState compact title="Нет активных продавцов" />
          ) : null}

          <button
            type="button"
            style={{ ...btnStyle, marginTop: "0.5rem" }}
            disabled={
              assignSellerToTrip.isPending ||
              !assignTripId.trim() ||
              !assignSellerUserId.trim() ||
              tripsAvailableForAssignment.length === 0
            }
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
        </BirzhaDisclosure>
      ) : (
        <BirzhaDisclosure
          defaultOpen={false}
          title={
            <h3 id="dispatch-sec-assign-readonly" className="birzha-section-title birzha-section-title--sm" style={{ margin: 0 }}>
              Привязка рейса к продавцу
            </h3>
          }
        >
          {null}
        </BirzhaDisclosure>
      )}

      <BirzhaDisclosure
        defaultOpen
        title={
          <h3 id="dispatch-sec-matrix" className="birzha-section-title birzha-section-title--sm" style={{ margin: 0 }}>
            Рейсы: продавец и товар
          </h3>
        }
      >
        {tripsQuery.isPending ? (
          <LoadingBlock label="Загрузка рейсов…" minHeight={64} skeleton skeletonRows={5} />
        ) : (
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
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
                    const seller = resolveUserLogin(sellerLoginById, t.assignedSellerUserId);
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
      </BirzhaDisclosure>
    </div>
  );
}
