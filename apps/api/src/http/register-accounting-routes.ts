import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  accountingPayablesQuerySchema,
  accountingPeriodSummaryQuerySchema,
  accountingReceivablesQuerySchema,
  createDebtPaymentBodySchema,
  createSupplierPaymentBodySchema,
  createTripExpenseBodySchema,
} from "@birzha/contracts";
import { z } from "zod";

import type { AuthRoleGrant } from "../auth/role-grant.js";
import { AccountingPayablesUseCase } from "../application/accounting/accounting-payables.use-case.js";
import { AccountingReceivablesUseCase } from "../application/accounting/accounting-receivables.use-case.js";
import { AccountingTripExpensesUseCase } from "../application/accounting/accounting-trip-expenses.use-case.js";
import type { DebtPaymentRepository } from "../application/ports/debt-payment-repository.port.js";
import type { PurchaseDocumentRepository } from "../application/ports/purchase-document-repository.port.js";
import type { SupplierPaymentRepository } from "../application/ports/supplier-payment-repository.port.js";
import type { TripExpenseRepository } from "../application/ports/trip-expense-repository.port.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../application/ports/trip-shortage-repository.port.js";
import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import { buildAccountingPeriodSummary } from "./accounting-period-summary.js";

import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";

type JwtRequestUser = { sub: string; login: string; roles: AuthRoleGrant[] };

function parseYmdToUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function amountToBigInt(raw: string | number): bigint {
  return BigInt(raw);
}

export function registerAccountingRoutes(
  app: FastifyInstance,
  deps: {
    sales: TripSaleRepository;
    trips: TripRepository;
    debtPayments: DebtPaymentRepository;
    purchaseDocuments?: PurchaseDocumentRepository | null;
    supplierPayments?: SupplierPaymentRepository | null;
    tripExpenses?: TripExpenseRepository | null;
    shipments?: TripShipmentRepository | null;
    shortages?: TripShortageRepository | null;
    batches?: BatchRepository | null;
  },
  routeAuth: BusinessRouteAuth,
): void {
  const receivables = new AccountingReceivablesUseCase(deps.sales, deps.debtPayments, deps.trips);
  const payables =
    deps.purchaseDocuments && deps.supplierPayments
      ? new AccountingPayablesUseCase(deps.purchaseDocuments, deps.supplierPayments)
      : null;
  const tripExpensesUc =
    deps.tripExpenses != null
      ? new AccountingTripExpensesUseCase(deps.trips, deps.tripExpenses)
      : null;

  app.get("/accounting/receivables", { ...withPreHandlers(routeAuth.accountingRead) }, async (req, reply) => {
    try {
      const q = accountingReceivablesQuerySchema.parse(req.query);
      const rows = await receivables.list({
        status: q.status,
        counterpartyId: q.counterpartyId,
        fromYmd: q.from,
        toYmd: q.to,
      });
      return reply.send({
        receivables: rows.map((r) => ({
          saleId: r.saleId,
          tripId: r.tripId,
          tripNumber: r.tripNumber,
          counterpartyId: r.counterpartyId,
          clientLabel: r.clientLabel,
          debtKopecks: r.debtKopecks.toString(),
          paidKopecks: r.paidKopecks.toString(),
          remainingKopecks: r.remainingKopecks.toString(),
          status: r.status,
          soldAt: r.soldAt.toISOString(),
          daysSinceSale: r.daysSinceSale,
        })),
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get(
    "/accounting/receivables/:saleId",
    { ...withPreHandlers(routeAuth.accountingRead) },
    async (req, reply) => {
      try {
        const { saleId } = z.object({ saleId: z.string().min(1) }).parse(req.params);
        const detail = await receivables.getSale(saleId);
        return reply.send({
          receivable: {
            saleId: detail.saleId,
            tripId: detail.tripId,
            tripNumber: detail.tripNumber,
            counterpartyId: detail.counterpartyId,
            clientLabel: detail.clientLabel,
            debtKopecks: detail.debtKopecks.toString(),
            paidKopecks: detail.paidKopecks.toString(),
            remainingKopecks: detail.remainingKopecks.toString(),
            status: detail.status,
            soldAt: detail.soldAt.toISOString(),
          },
          payments: detail.payments.map((p) => ({
            id: p.id,
            saleId: p.saleId,
            tripId: p.tripId,
            counterpartyId: p.counterpartyId,
            clientLabel: p.clientLabel,
            amountKopecks: p.amountKopecks.toString(),
            method: p.method,
            paidAt: p.paidAt.toISOString().slice(0, 10),
            comment: p.comment,
            recordedByUserId: p.recordedByUserId,
            createdAt: p.createdAt.toISOString(),
          })),
        });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.post(
    "/accounting/receivables/:saleId/payments",
    { ...withPreHandlers(routeAuth.accountingWrite) },
    async (req, reply) => {
      try {
        const { saleId } = z.object({ saleId: z.string().min(1) }).parse(req.params);
        const body = createDebtPaymentBodySchema.parse(req.body);
        const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
        const result = await receivables.recordPayment({
          saleId,
          amountKopecks: amountToBigInt(body.amountKopecks),
          method: body.method,
          paidAt: parseYmdToUtcDate(body.paidAt),
          comment: body.comment,
          recordedByUserId: user?.sub ?? null,
        });
        return reply.code(201).send({
          paymentId: result.paymentId,
          debtKopecks: result.debtKopecks.toString(),
          paidKopecks: result.paidKopecks.toString(),
          remainingKopecks: result.remainingKopecks.toString(),
        });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  app.delete(
    "/accounting/payments/:paymentId",
    { ...withPreHandlers(routeAuth.accountingAdminDelete) },
    async (req, reply) => {
      try {
        const { paymentId } = z.object({ paymentId: z.string().min(1) }).parse(req.params);
        await receivables.deletePayment(paymentId);
        return reply.code(204).send();
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );

  if (payables) {
    const pay = payables;
    app.get("/accounting/payables", { ...withPreHandlers(routeAuth.accountingRead) }, async (req, reply) => {
      try {
        const q = accountingPayablesQuerySchema.parse(req.query);
        const rows = await pay.list({
          status: q.status,
          supplierId: q.supplierId,
          fromYmd: q.from,
          toYmd: q.to,
        });
        return reply.send({
          payables: rows.map((r) => ({
            documentId: r.documentId,
            documentNumber: r.documentNumber,
            docDate: r.docDate,
            supplierId: r.supplierId,
            supplierName: r.supplierName,
            totalKopecks: r.totalKopecks.toString(),
            paidKopecks: r.paidKopecks.toString(),
            remainingKopecks: r.remainingKopecks.toString(),
            status: r.status,
          })),
        });
      } catch (error) {
        return sendMappedError(reply, error);
      }
    });

    app.get(
      "/accounting/payables/:documentId",
      { ...withPreHandlers(routeAuth.accountingRead) },
      async (req, reply) => {
        try {
          const { documentId } = z.object({ documentId: z.string().min(1) }).parse(req.params);
          const detail = await pay.getDocument(documentId);
          return reply.send({
            payable: {
              documentId: detail.documentId,
              documentNumber: detail.documentNumber,
              docDate: detail.docDate,
              supplierId: detail.supplierId,
              supplierName: detail.supplierName,
              totalKopecks: detail.totalKopecks.toString(),
              paidKopecks: detail.paidKopecks.toString(),
              remainingKopecks: detail.remainingKopecks.toString(),
              status: detail.status,
            },
            payments: detail.payments.map((p) => ({
              id: p.id,
              purchaseDocumentId: p.purchaseDocumentId,
              supplierId: p.supplierId,
              amountKopecks: p.amountKopecks.toString(),
              method: p.method,
              paidAt: p.paidAt.toISOString().slice(0, 10),
              comment: p.comment,
              recordedByUserId: p.recordedByUserId,
              createdAt: p.createdAt.toISOString(),
            })),
          });
        } catch (error) {
          return sendMappedError(reply, error);
        }
      },
    );

    app.post(
      "/accounting/payables/:documentId/payments",
      { ...withPreHandlers(routeAuth.accountingWrite) },
      async (req, reply) => {
        try {
          const { documentId } = z.object({ documentId: z.string().min(1) }).parse(req.params);
          const body = createSupplierPaymentBodySchema.parse(req.body);
          const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
          const result = await pay.recordPayment({
            documentId,
            amountKopecks: amountToBigInt(body.amountKopecks),
            method: body.method,
            paidAt: parseYmdToUtcDate(body.paidAt),
            comment: body.comment,
            recordedByUserId: user?.sub ?? null,
          });
          return reply.code(201).send({
            paymentId: result.paymentId,
            totalKopecks: result.totalKopecks.toString(),
            paidKopecks: result.paidKopecks.toString(),
            remainingKopecks: result.remainingKopecks.toString(),
          });
        } catch (error) {
          return sendMappedError(reply, error);
        }
      },
    );

    app.delete(
      "/accounting/supplier-payments/:paymentId",
      { ...withPreHandlers(routeAuth.accountingAdminDelete) },
      async (req, reply) => {
        try {
          const { paymentId } = z.object({ paymentId: z.string().min(1) }).parse(req.params);
          await pay.deletePayment(paymentId);
          return reply.code(204).send();
        } catch (error) {
          return sendMappedError(reply, error);
        }
      },
    );
  }

  if (tripExpensesUc) {
    const exp = tripExpensesUc;
    app.get(
      "/accounting/trips/:tripId/expenses",
      { ...withPreHandlers(routeAuth.accountingRead) },
      async (req, reply) => {
        try {
          const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
          const result = await exp.list(tripId);
          return reply.send({
            tripId: result.tripId,
            tripNumber: result.tripNumber,
            totalKopecks: result.totalKopecks.toString(),
            expenses: result.expenses.map((e) => ({
              id: e.id,
              tripId: e.tripId,
              category: e.category,
              amountKopecks: e.amountKopecks.toString(),
              expenseDate: e.expenseDate.toISOString().slice(0, 10),
              comment: e.comment,
              recordedByUserId: e.recordedByUserId,
              createdAt: e.createdAt.toISOString(),
            })),
          });
        } catch (error) {
          return sendMappedError(reply, error);
        }
      },
    );

    app.post(
      "/accounting/trips/:tripId/expenses",
      { ...withPreHandlers(routeAuth.accountingWrite) },
      async (req, reply) => {
        try {
          const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
          const body = createTripExpenseBodySchema.parse(req.body);
          const user = (req as FastifyRequest & { user?: JwtRequestUser }).user;
          const result = await exp.record({
            tripId,
            category: body.category,
            amountKopecks: amountToBigInt(body.amountKopecks),
            expenseDate: parseYmdToUtcDate(body.expenseDate),
            comment: body.comment,
            recordedByUserId: user?.sub ?? null,
          });
          return reply.code(201).send(result);
        } catch (error) {
          return sendMappedError(reply, error);
        }
      },
    );

    app.delete(
      "/accounting/expenses/:expenseId",
      { ...withPreHandlers(routeAuth.accountingAdminDelete) },
      async (req, reply) => {
        try {
          const { expenseId } = z.object({ expenseId: z.string().min(1) }).parse(req.params);
          await exp.delete(expenseId);
          return reply.code(204).send();
        } catch (error) {
          return sendMappedError(reply, error);
        }
      },
    );
  }

  app.get(
    "/accounting/period-summary",
    { ...withPreHandlers(routeAuth.accountingRead) },
    async (req, reply) => {
      try {
        const q = accountingPeriodSummaryQuerySchema.parse(req.query);
        const summary = await buildAccountingPeriodSummary({
          fromYmd: q.from,
          toYmd: q.to,
          sales: deps.sales,
          trips: deps.trips,
          debtPayments: deps.debtPayments,
          purchaseDocuments: deps.purchaseDocuments ?? null,
          supplierPayments: deps.supplierPayments ?? null,
          tripExpenses: deps.tripExpenses ?? null,
          shipments: deps.shipments ?? null,
          shortages: deps.shortages ?? null,
          batches: deps.batches ?? null,
        });
        return reply.send(summary);
      } catch (error) {
        return sendMappedError(reply, error);
      }
    },
  );
}
