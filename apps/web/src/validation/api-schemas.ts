import {
  createBatchBodySchema,
  createPurchaseDocumentBodySchema,
  createTripBodySchema,
  purchaseDocumentLineInputSchema,
  receiveBodySchema,
  recordTripShortageBodySchema,
  sellFromTripBodySchema,
  shipBodySchema,
} from "@birzha/contracts";
import type { CreatePurchaseDocumentBody } from "@birzha/contracts";
import { z, ZodError } from "zod";

import { randomUuid } from "../lib/random-uuid.js";
import { zodErrorMessage } from "./zod-error-message.js";

function mapZod<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ZodError) {
      throw new Error(zodErrorMessage(e));
    }
    throw e;
  }
}

/** Реэкспорт для тестов и внешнего использования — источник правды `@birzha/contracts`. */
export {
  createBatchBodySchema,
  createPurchaseDocumentBodySchema,
  createTripBodySchema,
  purchaseDocumentLineInputSchema,
  receiveBodySchema,
  recordTripShortageBodySchema,
  sellFromTripBodySchema,
  shipBodySchema,
};
export type { CreatePurchaseDocumentBody };

const batchIdParam = z.string().min(1);

function parseDecimalKg(raw: string): number {
  return Number(raw.replace(",", "."));
}

export function parseCreateBatchForm(input: {
  batchId: string;
  purchaseId: string;
  totalKg: string;
  pricePerKg: string;
  distribution: "awaiting_receipt" | "on_hand";
}) {
  return mapZod(() => {
    const id = input.batchId.trim() || randomUuid();
    const purchaseId = input.purchaseId.trim() || randomUuid();
    const totalKg = parseDecimalKg(input.totalKg);
    const pricePerKg = parseDecimalKg(input.pricePerKg);
    return createBatchBodySchema.parse({ id, purchaseId, totalKg, pricePerKg, distribution: input.distribution });
  });
}

export function parseReceiveForm(batchIdRaw: string, kgRaw: string) {
  return mapZod(() => {
    const batchId = batchIdParam.parse(batchIdRaw.trim());
    const kg = parseDecimalKg(kgRaw);
    return { batchId, body: receiveBodySchema.parse({ kg }) };
  });
}

export function parseShipForm(batchIdRaw: string, tripIdRaw: string, kgRaw: string, packageCountRaw?: string) {
  return mapZod(() => {
    const batchId = batchIdParam.parse(batchIdRaw.trim());
    const tripId = batchIdParam.parse(tripIdRaw.trim());
    const kg = parseDecimalKg(kgRaw);
    const trimmed = packageCountRaw?.trim() ?? "";
    const base: z.infer<typeof shipBodySchema> =
      trimmed === ""
        ? { tripId, kg }
        : (() => {
            const n = Number.parseInt(trimmed, 10);
            if (!Number.isFinite(n) || n < 0) {
              throw new Error("Ящики: укажите целое неотрицательное число или оставьте поле пустым");
            }
            return { tripId, kg, packageCount: n };
          })();
    return { batchId, body: shipBodySchema.parse(base) };
  });
}

export function parseSellFromTripForm(input: {
  batchId: string;
  tripId: string;
  kg: string;
  saleId: string;
  pricePerKg: string;
  paymentKind: "cash" | "debt" | "mixed";
  cashMixed: string;
  clientLabel?: string;
  counterpartyId?: string;
}) {
  return mapZod(() => {
    const batchId = batchIdParam.parse(input.batchId.trim());
    const tripId = batchIdParam.parse(input.tripId.trim());
    const kg = parseDecimalKg(input.kg);
    const saleId = input.saleId.trim() || randomUuid();
    const pricePerKg = parseDecimalKg(input.pricePerKg);

    const base: z.infer<typeof sellFromTripBodySchema> = {
      tripId,
      kg,
      saleId,
      pricePerKg,
      paymentKind: input.paymentKind,
    };
    if (input.paymentKind === "mixed") {
      const cm = input.cashMixed.trim();
      base.cashKopecksMixed = cm || undefined;
    }
    const cp = input.counterpartyId?.trim();
    if (cp) {
      base.counterpartyId = cp;
    } else {
      const cl = input.clientLabel?.trim();
      if (cl) {
        base.clientLabel = cl;
      }
    }
    return { batchId, body: sellFromTripBodySchema.parse(base) };
  });
}

export function parseRecordTripShortageForm(batchIdRaw: string, tripIdRaw: string, kgRaw: string, reasonRaw: string) {
  return mapZod(() => {
    const batchId = batchIdParam.parse(batchIdRaw.trim());
    const tripId = batchIdParam.parse(tripIdRaw.trim());
    const kg = parseDecimalKg(kgRaw);
    const reason = reasonRaw.trim();
    return { batchId, body: recordTripShortageBodySchema.parse({ tripId, kg, reason }) };
  });
}

export function parseCreateTripForm(tripIdRaw: string, tripNumberRaw: string) {
  return mapZod(() => {
    const id = tripIdRaw.trim() || randomUuid();
    const tripNumber = tripNumberRaw.trim();
    return createTripBodySchema.parse({ id, tripNumber });
  });
}

/** Ожидаемая сумма строки накладной в копейках (для подсказки в форме). */
export function expectedLineTotalKopecks(totalKg: number, pricePerKg: number): number {
  return Math.round(totalKg * pricePerKg * 100);
}

export function parseCreatePurchaseDocumentForm(input: {
  documentId: string;
  documentNumber: string;
  docDate: string;
  warehouseId: string;
  supplierName: string;
  buyerLabel: string;
  extraCostKopecks: string;
  lines: Array<{
    productGradeId: string;
    totalKg: string;
    packageCount: string;
    pricePerKg: string;
    lineTotalKopecks: string;
  }>;
}): CreatePurchaseDocumentBody {
  return mapZod(() => {
    const extraRaw = input.extraCostKopecks.trim().replace(/\s/g, "").replace(",", ".");
    const extraCostKopecks =
      extraRaw === "" ? 0 : Math.round(Number(extraRaw));
    if (!Number.isFinite(extraCostKopecks) || extraCostKopecks < 0) {
      throw new Error("Доп. расходы: неотрицательное целое число копеек");
    }

    const lines = input.lines.map((row, idx) => {
      const productGradeId = row.productGradeId.trim();
      if (!productGradeId) {
        throw new Error(`Строка ${idx + 1}: выберите калибр`);
      }
      const totalKg = parseDecimalKg(row.totalKg);
      const pricePerKg = parseDecimalKg(row.pricePerKg);
      const pkgRaw = row.packageCount.trim();
      let packageCount: number | undefined;
      if (pkgRaw !== "") {
        const n = Number.parseInt(pkgRaw, 10);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`Строка ${idx + 1}: короба — целое неотрицательное число`);
        }
        packageCount = n;
      }
      const kRaw = row.lineTotalKopecks.trim().replace(/\s/g, "");
      const lineTotalKopecks = Math.round(Number(kRaw));
      if (!Number.isFinite(lineTotalKopecks) || lineTotalKopecks < 0) {
        throw new Error(`Строка ${idx + 1}: сумма строки в копейках — неотрицательное целое`);
      }
      return purchaseDocumentLineInputSchema.parse({
        productGradeId,
        totalKg,
        pricePerKg,
        lineTotalKopecks,
        ...(packageCount !== undefined ? { packageCount } : {}),
      });
    });

    const payload: Record<string, unknown> = {
      documentNumber: input.documentNumber.trim(),
      docDate: input.docDate.trim(),
      warehouseId: input.warehouseId.trim(),
      extraCostKopecks,
      lines,
    };
    const docId = input.documentId.trim();
    if (docId) {
      payload.id = docId;
    }
    const sup = input.supplierName.trim();
    if (sup) {
      payload.supplierName = sup;
    }
    const buy = input.buyerLabel.trim();
    if (buy) {
      payload.buyerLabel = buy;
    }
    return createPurchaseDocumentBodySchema.parse(payload);
  });
}
