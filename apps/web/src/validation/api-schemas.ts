import {
  createBatchBodySchema,
  createPurchaseDocumentBodySchema,
  createTripBodySchema,
  kopecksFromNakladnayaAmountField,
  kopecksFromNakladnayaAmountFieldForSum,
  nonnegativeDecimalStringToNumber,
  numberToDecimalStringForKopecks,
  purchaseDocumentLineInputSchema,
  purchaseLineAmountKopecksFromDecimalStrings,
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

export function parseCreateTripForm(
  tripIdRaw: string,
  tripNumberRaw: string,
  vehicleLabelRaw = "",
  driverNameRaw = "",
  departedAtLocal = "",
  assignedSellerUserIdRaw = "",
) {
  return mapZod(() => {
    const id = tripIdRaw.trim() || randomUuid();
    const tripNumber = tripNumberRaw.trim();
    let departedAt: string | null | undefined;
    if (departedAtLocal.trim() !== "") {
      const d = new Date(departedAtLocal);
      if (Number.isNaN(d.getTime())) {
        throw new Error("Время отправления: введите корректные дату и время");
      }
      departedAt = d.toISOString();
    }
    const assignedSellerUserId =
      assignedSellerUserIdRaw.trim() === "" ? null : assignedSellerUserIdRaw.trim();
    return createTripBodySchema.parse({
      id,
      tripNumber,
      vehicleLabel: vehicleLabelRaw,
      driverName: driverNameRaw,
      departedAt,
      assignedSellerUserId,
    });
  });
}

/** Ожидаемая сумма строки накладной в копейках (из уже распарсенных чисел — как на сервере). */
export function expectedLineTotalKopecks(totalKg: number, pricePerKg: number): number {
  return purchaseLineAmountKopecksFromDecimalStrings(
    numberToDecimalStringForKopecks(totalKg, 6),
    numberToDecimalStringForKopecks(pricePerKg, 4),
  );
}

/**
 * Короба в строке накладной: пусто не сюда — в форме.
 * Пробелы убираются, запятая как в десятичной записи, на сервер — целое (округление).
 * `null` — ввод невалиден.
 */
export function linePackageCountFromNakladnayaString(raw: string): number | null {
  const t = raw.trim();
  if (t === "") {
    return 0;
  }
  const normalized = t.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.max(0, Math.round(n));
}

/** Суммирование коробов в итогах: пустая строка → 0, иначе как `linePackageCountFromNakladnayaString` (невалид — 0). */
export function linePackageCountForNakladnayaSum(raw: string): number {
  const t = raw.trim();
  if (t === "") {
    return 0;
  }
  return linePackageCountFromNakladnayaString(t) ?? 0;
}

/** Сумма в копейках для итогов: пусто 0, иначе тот же разбор, что при отправке (см. `kopecksFromNakladnayaAmountField`). */
export function lineTotalKopecksForNakladnayaSum(raw: string): number {
  return kopecksFromNakladnayaAmountFieldForSum(raw);
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
    const extraTrim = input.extraCostKopecks.trim();
    const extraParsed =
      extraTrim === "" ? 0 : kopecksFromNakladnayaAmountField(extraTrim);
    if (extraParsed === null) {
      throw new Error("Доп. расходы: пусто или «руб,коп» (например 100,50) либо только коп. целым (без . и ,), неотриц.");
    }
    if (extraParsed < 0) {
      throw new Error("Доп. расходы: неотрицательная сумма");
    }
    const extraCostKopecks = extraParsed;

    const lines = input.lines.map((row, idx) => {
      const productGradeId = row.productGradeId.trim();
      if (!productGradeId) {
        throw new Error(`Строка ${idx + 1}: выберите калибр`);
      }
      const totalKg = nonnegativeDecimalStringToNumber(row.totalKg, 6);
      const pricePerKg = nonnegativeDecimalStringToNumber(row.pricePerKg, 4);
      if (!Number.isFinite(totalKg) || totalKg <= 0) {
        throw new Error(`Строка ${idx + 1}: укажите массу, кг (положительное число, можно с дробной частью)`);
      }
      if (!Number.isFinite(pricePerKg) || pricePerKg < 0) {
        throw new Error(`Строка ${idx + 1}: укажите цену ₽/кг (неотрицательное число, до копеек в цене)`);
      }
      const pkgRaw = row.packageCount.trim();
      let packageCount: number | undefined;
      if (pkgRaw !== "") {
        const parsed = linePackageCountFromNakladnayaString(pkgRaw);
        if (parsed == null) {
          throw new Error(
            `Строка ${idx + 1}: короба — неотрицательное число, можно с запятой; в заявку — целое (округление)`,
          );
        }
        packageCount = parsed;
      }
      const lineK = kopecksFromNakladnayaAmountField(row.lineTotalKopecks.trim());
      if (lineK === null) {
        throw new Error(
          `Строка ${
            idx + 1
          }: укажите сумму: только копейки цифрами (50000) или «руб,коп» (32232,77), до копейки — без float`,
        );
      }
      if (lineK < 0) {
        throw new Error(`Строка ${idx + 1}: сумма — неотрицательная`);
      }
      const lineTotalKopecks = lineK;
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
