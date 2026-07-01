import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiFetch, apiPostJson, assertOkResponse } from "../api/fetch-api.js";
import { useAuth } from "../auth/auth-context.js";
import { hasGlobalRole } from "../auth/global-roles.js";
import { filterTripsInWork } from "../format/archive.js";
import { filterTripsWithoutAssignedSeller } from "../format/seller-trip-metrics.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import {
  queryRoots,
  tripsFieldSellerOptionsQueryOptions,
  tripsFullListQueryOptions,
} from "../query/core-list-queries.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { ErrorAlert, InfoAlert } from "../ui/ErrorAlerts.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";
import { fieldStyle, successText } from "../ui/styles.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };
const SELLER_ASSIGN_ROLES = ["admin", "manager", "purchaser", "logistics"] as const;

type AdminUserRow = { id: string; login: string; isActive: boolean; roleCodes: string[] };

/** Закрепление свободного рейса за продавцом (раньше отдельная вкладка «Назначить продавца»). */
export function SellerTripAssignBlock() {
  const { meta, user } = useAuth();
  const queryClient = useQueryClient();
  const tripsQuery = useQuery(tripsFullListQueryOptions());
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
  }, [fieldSellersQuery.data?.fieldSellers, sellerUsersQuery.data]);

  const sellerOptions = useMemo(() => {
    return [...sellerLoginById.entries()]
      .map(([id, login]) => ({ id, login }))
      .sort((a, b) => a.login.localeCompare(b.login, "ru"));
  }, [sellerLoginById]);

  const [assignTripId, setAssignTripId] = useState("");
  const [assignSellerUserId, setAssignSellerUserId] = useState("");

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

  if (!canAssignSeller) {
    return null;
  }

  return (
    <BirzhaDisclosure
      defaultOpen
      title={
        <h3 className="birzha-section-title birzha-section-title--sm" style={{ margin: 0 }}>
          Закрепить рейс за продавцом
        </h3>
      }
    >
      <label htmlFor="assign-block-seller" className="birzha-form-label birzha-form-label--block">
        Продавец *
      </label>
      <BirzhaSelect
        id="assign-block-seller"
        value={assignSellerUserId}
        onChange={setAssignSellerUserId}
        style={{ ...selectWide, marginBottom: "0.45rem" }}
        disabled={sellerOptions.length === 0}
        placeholder={sellerOptions.length === 0 ? "— нет продавцов —" : "— выберите продавца —"}
        options={[
          {
            value: "",
            label: sellerOptions.length === 0 ? "— нет продавцов —" : "— выберите продавца —",
          },
          ...sellerOptions.map((s) => ({ value: s.id, label: s.login })),
        ]}
      />

      <label htmlFor="assign-block-trip" className="birzha-form-label">
        Рейс *
      </label>
      {tripsQuery.isPending ? (
        <p style={{ margin: "0.15rem 0 0.35rem" }} role="status" aria-live="polite">
          <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
        </p>
      ) : null}
      <BirzhaSelect
        id="assign-block-trip"
        value={assignTripId}
        onChange={setAssignTripId}
        style={selectWide}
        disabled={tripsQuery.isPending}
        placeholder={
          tripsQuery.isPending
            ? "— загрузка рейсов —"
            : tripsAvailableForAssignment.length === 0
              ? "— нет свободных рейсов —"
              : "— выберите рейс —"
        }
        options={[
          {
            value: "",
            label: tripsQuery.isPending
              ? "— загрузка рейсов —"
              : tripsAvailableForAssignment.length === 0
                ? "— нет свободных рейсов —"
                : "— выберите рейс —",
          },
          ...tripsAvailableForAssignment.map((t) => ({
            value: t.id,
            label: formatTripSelectLabel(t),
          })),
        ]}
      />
      {fieldSellersQuery.isError ? (
        <ErrorAlert message="Список продавцов не загрузился." title="Продавцы" />
      ) : null}
      {fieldSellersQuery.isSuccess && (fieldSellersQuery.data?.fieldSellers.length ?? 0) === 0 ? (
        <BirzhaEmptyState compact title="Нет активных продавцов" />
      ) : null}

      <InfoAlert title="Порядок работы">
        Закрепите рейс за продавцом, когда готовы к отгрузке в поле. Догрузка товара в погрузочную накладную остаётся
        доступной в любое время.
      </InfoAlert>

      <button
        type="button"
        className="birzha-btn birzha-btn--spaced"
        style={{ marginTop: "0.5rem" }}
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
          Рейс закреплён. Ниже — продажи по выбранному продавцу.
        </p>
      ) : null}
    </BirzhaDisclosure>
  );
}
