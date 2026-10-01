import { Obligation, PaymentExceedsDebtError } from "@birzha/domain";
import { randomUUID } from "node:crypto";

import { PurchaseDocumentNotFoundError, SupplierPaymentNotFoundError } from "../errors.js";
import type { PurchaseDocumentRepository } from "../ports/purchase-document-repository.port.js";
import type { SupplierPaymentRepository } from "../ports/supplier-payment-repository.port.js";

export type PayableListStatus = "open" | "closed" | "all";

export type PayableRow = {
  documentId: string;
  documentNumber: string;
  docDate: string;
  supplierId: string | null;
  supplierName: string | null;
  totalKopecks: bigint;
  paidKopecks: bigint;
  remainingKopecks: bigint;
  status: "open" | "closed";
};

function ymdFromDocDate(docDate: string): string {
  return docDate.slice(0, 10);
}

export class AccountingPayablesUseCase {
  constructor(
    private readonly purchaseDocuments: PurchaseDocumentRepository,
    private readonly payments: SupplierPaymentRepository,
  ) {}

  async list(input: {
    status: PayableListStatus;
    supplierId?: string;
    fromYmd?: string;
    toYmd?: string;
  }): Promise<PayableRow[]> {
    const summaries = await this.purchaseDocuments.listSummaries();
    const out: PayableRow[] = [];
    for (const s of summaries) {
      const detail = await this.purchaseDocuments.findByIdWithLines(s.id);
      if (!detail) {
        continue;
      }
      const day = ymdFromDocDate(detail.docDate);
      if (input.fromYmd && day < input.fromYmd) {
        continue;
      }
      if (input.toYmd && day > input.toYmd) {
        continue;
      }
      if (input.supplierId && (detail.supplierId ?? "") !== input.supplierId) {
        continue;
      }
      let linesTotal = 0n;
      for (const line of detail.lines) {
        linesTotal += BigInt(line.lineTotalKopecks);
      }
      const totalKopecks = linesTotal + BigInt(detail.extraCostKopecks);
      if (totalKopecks <= 0n) {
        continue;
      }
      const paid = await this.payments.sumPaidByDocumentId(detail.id);
      const obl = Obligation.restore({ debtKopecks: totalKopecks, paidKopecks: paid });
      const remaining = obl.remainingKopecks();
      const status: "open" | "closed" = remaining === 0n ? "closed" : "open";
      if (input.status === "open" && status !== "open") {
        continue;
      }
      if (input.status === "closed" && status !== "closed") {
        continue;
      }
      out.push({
        documentId: detail.id,
        documentNumber: detail.documentNumber,
        docDate: day,
        supplierId: detail.supplierId,
        supplierName: detail.supplierName,
        totalKopecks,
        paidKopecks: paid,
        remainingKopecks: remaining,
        status,
      });
    }
    return out.sort((a, b) => b.docDate.localeCompare(a.docDate) || a.documentNumber.localeCompare(b.documentNumber, "ru"));
  }

  async getDocument(documentId: string) {
    const detail = await this.purchaseDocuments.findByIdWithLines(documentId);
    if (!detail) {
      throw new PurchaseDocumentNotFoundError(documentId);
    }
    let linesTotal = 0n;
    for (const line of detail.lines) {
      linesTotal += BigInt(line.lineTotalKopecks);
    }
    const totalKopecks = linesTotal + BigInt(detail.extraCostKopecks);
    const payments = await this.payments.listByDocumentId(documentId);
    const paid = payments.reduce((a, p) => a + p.amountKopecks, 0n);
    const obl = Obligation.restore({ debtKopecks: totalKopecks, paidKopecks: paid });
    return {
      documentId: detail.id,
      documentNumber: detail.documentNumber,
      docDate: ymdFromDocDate(detail.docDate),
      supplierId: detail.supplierId,
      supplierName: detail.supplierName,
      totalKopecks,
      paidKopecks: paid,
      remainingKopecks: obl.remainingKopecks(),
      status: (obl.remainingKopecks() === 0n ? "closed" : "open") as "open" | "closed",
      payments,
    };
  }

  async recordPayment(input: {
    documentId: string;
    amountKopecks: bigint;
    method: "cash" | "card" | "bank";
    paidAt: Date;
    comment?: string | null;
    recordedByUserId?: string | null;
  }) {
    const detail = await this.purchaseDocuments.findByIdWithLines(input.documentId);
    if (!detail) {
      throw new PurchaseDocumentNotFoundError(input.documentId);
    }
    let linesTotal = 0n;
    for (const line of detail.lines) {
      linesTotal += BigInt(line.lineTotalKopecks);
    }
    const totalKopecks = linesTotal + BigInt(detail.extraCostKopecks);
    const paid = await this.payments.sumPaidByDocumentId(detail.id);
    const obl = Obligation.restore({ debtKopecks: totalKopecks, paidKopecks: paid });
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
      purchaseDocumentId: detail.id,
      supplierId: detail.supplierId,
      amountKopecks: input.amountKopecks,
      method: input.method,
      paidAt: input.paidAt,
      comment: input.comment,
      recordedByUserId: input.recordedByUserId,
    });
    return {
      paymentId: id,
      totalKopecks,
      paidKopecks: obl.getPaidKopecks(),
      remainingKopecks: obl.remainingKopecks(),
    };
  }

  async deletePayment(paymentId: string): Promise<void> {
    const row = await this.payments.findById(paymentId);
    if (!row) {
      throw new SupplierPaymentNotFoundError(paymentId);
    }
    await this.payments.deleteById(paymentId);
  }
}
