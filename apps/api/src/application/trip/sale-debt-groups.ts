import type {
  TripSaleDebtGroup,
  TripSaleDebtListFilter,
  TripSaleLineRecord,
} from "../ports/trip-sale-repository.port.js";

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildSaleDebtGroupsFromLines(lines: readonly TripSaleLineRecord[]): TripSaleDebtGroup[] {
  const bySale = new Map<string, TripSaleDebtGroup>();
  for (const line of lines) {
    if (line.debtKopecks <= 0n) {
      continue;
    }
    const existing = bySale.get(line.saleId);
    if (!existing) {
      bySale.set(line.saleId, {
        saleId: line.saleId,
        tripId: line.tripId,
        counterpartyId: line.counterpartyId,
        clientLabel: line.clientLabel,
        debtKopecks: line.debtKopecks,
        firstRecordedAt: line.recordedAt,
      });
      continue;
    }
    existing.debtKopecks += line.debtKopecks;
    if (line.recordedAt.getTime() < existing.firstRecordedAt.getTime()) {
      existing.firstRecordedAt = line.recordedAt;
    }
    if (!existing.counterpartyId && line.counterpartyId) {
      existing.counterpartyId = line.counterpartyId;
    }
    if (!existing.clientLabel?.trim() && line.clientLabel?.trim()) {
      existing.clientLabel = line.clientLabel;
    }
  }
  return [...bySale.values()].sort(
    (a, b) => b.firstRecordedAt.getTime() - a.firstRecordedAt.getTime(),
  );
}

export function filterSaleDebtGroups(
  groups: readonly TripSaleDebtGroup[],
  filter?: TripSaleDebtListFilter,
): TripSaleDebtGroup[] {
  if (!filter) {
    return [...groups];
  }
  return groups.filter((g) => {
    if (filter.tripId && g.tripId !== filter.tripId) {
      return false;
    }
    if (filter.counterpartyId && (g.counterpartyId ?? "") !== filter.counterpartyId) {
      return false;
    }
    const day = ymdUtc(g.firstRecordedAt);
    if (filter.fromYmd && day < filter.fromYmd) {
      return false;
    }
    if (filter.toYmd && day > filter.toYmd) {
      return false;
    }
    return true;
  });
}
