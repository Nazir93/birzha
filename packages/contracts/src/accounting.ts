import { z } from "zod";

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ожидается дата YYYY-MM-DD");

const kopecksPositive = z.union([
  z.string().regex(/^[1-9]\d*$/),
  z.number().int().positive(),
]);

/** GET /accounting/receivables */
export const accountingReceivablesQuerySchema = z.object({
  status: z.enum(["open", "closed", "all"]).optional().default("open"),
  counterpartyId: z.string().min(1).max(64).optional(),
  from: ymd.optional(),
  to: ymd.optional(),
});

/** POST /accounting/receivables/:saleId/payments */
export const createDebtPaymentBodySchema = z.object({
  amountKopecks: kopecksPositive,
  method: z.enum(["cash", "card", "bank"]),
  paidAt: ymd,
  comment: z.string().max(500).optional(),
});

export type CreateDebtPaymentBody = z.infer<typeof createDebtPaymentBodySchema>;
export type AccountingReceivablesQuery = z.infer<typeof accountingReceivablesQuerySchema>;

/** GET /accounting/payables */
export const accountingPayablesQuerySchema = z.object({
  status: z.enum(["open", "closed", "all"]).optional().default("open"),
  supplierId: z.string().min(1).max(64).optional(),
  from: ymd.optional(),
  to: ymd.optional(),
});

/** POST /accounting/payables/:documentId/payments */
export const createSupplierPaymentBodySchema = z.object({
  amountKopecks: kopecksPositive,
  method: z.enum(["cash", "card", "bank"]),
  paidAt: ymd,
  comment: z.string().max(500).optional(),
});

export type CreateSupplierPaymentBody = z.infer<typeof createSupplierPaymentBodySchema>;
export type AccountingPayablesQuery = z.infer<typeof accountingPayablesQuerySchema>;

/** POST /accounting/trips/:tripId/expenses */
export const createTripExpenseBodySchema = z.object({
  category: z.enum(["fuel", "road", "driver", "other"]),
  amountKopecks: kopecksPositive,
  expenseDate: ymd,
  comment: z.string().max(500).optional(),
});

export type CreateTripExpenseBody = z.infer<typeof createTripExpenseBodySchema>;

/** GET /accounting/period-summary */
export const accountingPeriodSummaryQuerySchema = z
  .object({
    from: ymd,
    to: ymd,
  })
  .refine((q) => q.from <= q.to, { message: "from не позже to", path: ["to"] });

export type AccountingPeriodSummaryQuery = z.infer<typeof accountingPeriodSummaryQuerySchema>;

/** GET /accounting/purchaser-expenses */
export const accountingPurchaserExpensesQuerySchema = z
  .object({
    from: ymd.optional(),
    to: ymd.optional(),
    purchaserUserId: z.string().min(1).max(64).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from не позже to", path: ["to"] });

/** POST /accounting/purchaser-expenses */
export const createPurchaserExpenseBodySchema = z.object({
  category: z.enum(["salary", "other"]),
  amountKopecks: kopecksPositive,
  expenseDate: ymd,
  purchaserUserId: z.string().min(1).max(64).optional(),
  purchaserLabel: z.string().min(1).max(120).optional(),
  comment: z.string().max(500).optional(),
});

export type AccountingPurchaserExpensesQuery = z.infer<typeof accountingPurchaserExpensesQuerySchema>;
export type CreatePurchaserExpenseBody = z.infer<typeof createPurchaserExpenseBodySchema>;
