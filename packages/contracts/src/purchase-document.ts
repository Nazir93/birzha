import { z } from "zod";

/** Строка закупочной накладной: одна строка → одна партия на складе. */
export const purchaseDocumentLineInputSchema = z.object({
  productGradeId: z.string().min(1).max(64),
  totalKg: z.number().finite().positive(),
  packageCount: z.number().int().nonnegative().optional(),
  /** Закупочная цена за кг, руб (как в колонке «Цена» накладной). */
  pricePerKg: z.number().finite().nonnegative(),
  /** Сумма строки в копейках (контроль согласованности с кг × цена). */
  lineTotalKopecks: z.number().int().nonnegative(),
});

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
