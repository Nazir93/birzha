import { Obligation, PaymentExceedsDebtError } from "@birzha/domain";
import { randomUUID } from "node:crypto";

import type { DebtPaymentRepository } from "../ports/debt-payment-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import { DebtPaymentNotFoundError, SaleDebtNotFoundError } from "../errors.js";

export type RecordDebtPaymentInput = {
  saleId: string;
  amountKopecks: bigint;
  method: "cash" | "card" | "bank";
  paidAt: Date;
  comment?: string | null;
  recordedByUserId?: string | null;
};

export type ReceivableListStatus = "open" | "closed" | "all";

export type ReceivableRow = {
  saleId: string;
  tripId: string;
  tripNumber: string;
  counterpartyId: string | null;
  clientLabel: string | null;
  debtKopecks: bigint;
  paidKopecks: bigint;
  remainingKopecks: bigint;
  status: "open" | "closed";
  soldAt: Date;
  daysSinceSale: number;
};

function daysBetweenUtc(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

export class AccountingReceivablesUseCase {
  constructor(
    private readonly sales: TripSaleRepository,
    private readonly payments: DebtPaymentRepository,
    private readonly trips: TripRepository,
  ) {}

  async list(input: {
    status: ReceivableListStatus;
    counterpartyId?: string;
    fromYmd?: string;
    toYmd?: string;
  }): Promise<ReceivableRow[]> {
    const groups = await this.sales.listDebtGroups({
      counterpartyId: input.counterpartyId,
      fromYmd: input.fromYmd,
      toYmd: input.toYmd,
    });
    const paidMap = await this.payments.sumPaidBySaleIds(groups.map((g) => g.saleId));
    const now = new Date();
    const out: ReceivableRow[] = [];
    for (const g of groups) {
      const paid = paidMap.get(g.saleId) ?? 0n;
      const obl = Obligation.restore({ debtKopecks: g.debtKopecks, paidKopecks: paid });
      const remaining = obl.remainingKopecks();
      const status: "open" | "closed" = remaining === 0n ? "closed" : "open";
      if (input.status === "open" && status !== "open") {
        continue;
      }
      if (input.status === "closed" && status !== "closed") {
        continue;
      }
      const trip = await this.trips.findById(g.tripId);
      out.push({
        saleId: g.saleId,
        tripId: g.tripId,
        tripNumber: trip?.getTripNumber() ?? g.tripId,
        counterpartyId: g.counterpartyId,
        clientLabel: g.clientLabel,
        debtKopecks: g.debtKopecks,
        paidKopecks: paid,
        remainingKopecks: remaining,
        status,
        soldAt: g.firstRecordedAt,
        daysSinceSale: daysBetweenUtc(g.firstRecordedAt, now),
      });
    }
    return out;
  }

  async getSale(saleId: string) {
    const group = await this.sales.findDebtGroupBySaleId(saleId);
    if (!group) {
      throw new SaleDebtNotFoundError(saleId);
    }
    const payments = await this.payments.listBySaleId(saleId);
    const paid = payments.reduce((a, p) => a + p.amountKopecks, 0n);
    const obl = Obligation.restore({ debtKopecks: group.debtKopecks, paidKopecks: paid });
    const trip = await this.trips.findById(group.tripId);
    return {
      saleId: group.saleId,
      tripId: group.tripId,
      tripNumber: trip?.getTripNumber() ?? group.tripId,
      counterpartyId: group.counterpartyId,
      clientLabel: group.clientLabel,
      debtKopecks: group.debtKopecks,
      paidKopecks: paid,
      remainingKopecks: obl.remainingKopecks(),
      status: (obl.remainingKopecks() === 0n ? "closed" : "open") as "open" | "closed",
      soldAt: group.firstRecordedAt,
      payments,
    };
  }

  async recordPayment(input: RecordDebtPaymentInput) {
    const group = await this.sales.findDebtGroupBySaleId(input.saleId);
    if (!group) {
      throw new SaleDebtNotFoundError(input.saleId);
    }
    const paid = await this.payments.sumPaidBySaleId(input.saleId);
    const obl = Obligation.restore({ debtKopecks: group.debtKopecks, paidKopecks: paid });
    try {
      obl.applyPayment(input.amountKopecks);
    } catch (e) {
      if (e instanceof PaymentExceedsDebtError) {
        throw e;
      }
      throw e;
    }
    const id = randomUUID();
    await this.payments.append({
      id,
      saleId: group.saleId,
      tripId: group.tripId,
      counterpartyId: group.counterpartyId,
      clientLabel: group.clientLabel,
      amountKopecks: input.amountKopecks,
      method: input.method,
      paidAt: input.paidAt,
      comment: input.comment,
      recordedByUserId: input.recordedByUserId,
    });
    return {
      paymentId: id,
      remainingKopecks: obl.remainingKopecks(),
      paidKopecks: obl.getPaidKopecks(),
      debtKopecks: group.debtKopecks,
    };
  }

  async deletePayment(paymentId: string): Promise<void> {
    const row = await this.payments.findById(paymentId);
    if (!row) {
      throw new DebtPaymentNotFoundError(paymentId);
    }
    await this.payments.deleteById(paymentId);
  }
}
