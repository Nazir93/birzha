import type { AuthRoleGrant } from "../../auth/role-grant.js";
import { isGlobalSellerOnly, tripVisibleToFieldSeller } from "../../auth/seller-scope.js";
import { TripSaleEditForbiddenError } from "../errors.js";
import type { TripSaleLineRecord } from "../ports/trip-sale-repository.port.js";

export function assertTripOpenForSaleEdit(trip: { canAcceptShipments(): boolean }, tripId: string): void {
  if (!trip.canAcceptShipments()) {
    throw new TripSaleEditForbiddenError("Рейс закрыт — правки продаж недоступны");
  }
  void tripId;
}

export function assertMayEditTripSaleLine(input: {
  trip: { getAssignedSellerUserId(): string | null };
  line: TripSaleLineRecord;
  editorUserId: string | undefined;
  editorRoles: AuthRoleGrant[] | undefined;
}): void {
  const roles = input.editorRoles ?? [];
  if (!isGlobalSellerOnly(roles)) {
    return;
  }
  const uid = input.editorUserId?.trim();
  if (!uid) {
    throw new TripSaleEditForbiddenError();
  }
  if (!tripVisibleToFieldSeller(input.trip, uid)) {
    throw new TripSaleEditForbiddenError("Этот рейс не закреплён за вами");
  }
  if ((input.line.recordedByUserId ?? null) !== uid) {
    throw new TripSaleEditForbiddenError("Можно исправлять только свои продажи");
  }
}
