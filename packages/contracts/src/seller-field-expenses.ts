import { z } from "zod";

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ожидается дата YYYY-MM-DD");

const kopecksPositive = z.union([
  z.string().regex(/^[1-9]\d*$/),
  z.number().int().positive(),
]);

export const sellerFieldExpenseCategorySchema = z.enum([
  "loader",
  "lunch",
  "pallets",
  "rent",
  "materials",
  "other",
]);

/** GET /seller-field-expenses */
export const sellerFieldExpensesQuerySchema = z
  .object({
    tripId: z.string().min(1).max(64).optional(),
    from: ymd.optional(),
    to: ymd.optional(),
    group: z.enum(["day", "week", "month"]).optional().default("day"),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from не позже to", path: ["to"] });

/** POST /seller-field-expenses */
export const createSellerFieldExpenseBodySchema = z.object({
  tripId: z.string().min(1).max(64),
  expenseDate: ymd,
  category: sellerFieldExpenseCategorySchema,
  amountKopecks: kopecksPositive,
  comment: z.string().max(500).optional(),
});

export type SellerFieldExpensesQuery = z.infer<typeof sellerFieldExpensesQuerySchema>;
export type CreateSellerFieldExpenseBody = z.infer<typeof createSellerFieldExpenseBodySchema>;
