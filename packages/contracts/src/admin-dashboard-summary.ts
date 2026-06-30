import { z } from "zod";

export const adminDashboardSummaryQuerySchema = z.object({
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type AdminDashboardSummaryQuery = z.infer<typeof adminDashboardSummaryQuerySchema>;

const dashboardStockSliceSchema = z.object({
  kg: z.number(),
  packages: z.number(),
  valueKopecks: z.string(),
});

export const adminDashboardSummaryResponseSchema = z.object({
  trips: z.object({
    openCount: z.number(),
    closedCount: z.number(),
    shippedKg: z.number(),
    soldKg: z.number(),
    remainingInTripKg: z.number(),
    shortageKg: z.number(),
  }),
  warehouse: z.object({
    warehouseKg: z.number(),
    batchCount: z.number(),
    inTransitKg: z.number(),
    pendingInboundKg: z.number(),
    byWarehouseKg: z.record(z.string(), z.number()),
    byProductGroupKg: z.record(z.string(), z.number()),
    stockTotals: dashboardStockSliceSchema,
    byGrade: z.array(
      dashboardStockSliceSchema.extend({
        productGradeId: z.string(),
        code: z.string(),
        displayName: z.string(),
        productGroup: z.string().nullable(),
      }),
    ),
    byWarehouse: z.array(
      dashboardStockSliceSchema.extend({
        warehouseId: z.string(),
        warehouseName: z.string(),
        byGrade: z.array(
          dashboardStockSliceSchema.extend({
            productGradeId: z.string(),
            code: z.string(),
            displayName: z.string(),
            productGroup: z.string().nullable(),
          }),
        ),
      }),
    ),
    byProductGroup: z.array(
      dashboardStockSliceSchema.extend({
        productGroup: z.string(),
      }),
    ),
  }),
  loadingManifests: z.object({
    activeCount: z.number(),
    withoutTripCount: z.number(),
    withoutTripKg: z.number(),
    activeKg: z.number(),
  }),
  attention: z.object({
    unassignedOpenTripsCount: z.number(),
  }),
});

export type AdminDashboardSummaryResponse = z.infer<typeof adminDashboardSummaryResponseSchema>;
