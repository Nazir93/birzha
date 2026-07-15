import { z } from "zod";

/**
 * Строка закупочной накладной: одна строка → одна партия на складе.
 * `grossKg` — брутто с весов; нетто = брутто − 0,5 кг × ящики (считает сервер).
 * `lineTotalKopecks` сверяется с нетто × цена.
 */
export const purchaseDocumentLineInputSchema = z.object({
  productGradeId: z.string().min(1).max(64),
  /** Брутто, кг (товар + тара ящиков). */
  grossKg: z.number().finite().positive(),
  packageCount: z.number().int().nonnegative().optional(),
  /** Закупочная цена за кг нетто, руб. */
  pricePerKg: z.number().finite().nonnegative(),
  /** Сумма строки в копейках (контроль согласованности с нетто × цена). */
  lineTotalKopecks: z.number().int().nonnegative(),
});

/**
 * PUT /purchase-documents/:id/lines — полная замена строк (Excel-правка до погрузки).
 * `batchId` — сохранить существующую партию; без него — новая строка/партия.
 */
export const replacePurchaseDocumentLinesBodySchema = z.object({
  lines: z
    .array(
      purchaseDocumentLineInputSchema.extend({
        batchId: z.string().min(1).max(64).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export type ReplacePurchaseDocumentLinesBody = z.infer<typeof replacePurchaseDocumentLinesBodySchema>;

/** POST /purchase-documents — тело как у бумажной накладной: шапка + строки. */
export const createPurchaseDocumentBodySchema = z.object({
  /** Явный id документа (опционально, иначе UUID на сервере). */
  id: z.string().min(1).max(64).optional(),
  documentNumber: z.string().min(1).max(64),
  /** Дата документа YYYY-MM-DD */
  docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplierName: z.string().max(300).optional(),
  buyerLabel: z.string().max(300).optional(),
  warehouseId: z.string().min(1).max(64),
  extraCostKopecks: z.number().int().nonnegative().optional().default(0),
  lines: z.array(purchaseDocumentLineInputSchema).min(1).max(200),
});

export type CreatePurchaseDocumentBody = z.infer<typeof createPurchaseDocumentBodySchema>;
export type PurchaseDocumentLineInput = z.infer<typeof purchaseDocumentLineInputSchema>;
