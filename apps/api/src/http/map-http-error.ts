import {
  InsufficientStockError,
  InvalidKgError,
} from "@birzha/domain";
import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

import {
  BatchNotFoundError,
  CounterpartyNotFoundError,
  InsufficientStockForTripError,
  ProductGradeCodeConflictError,
  ProductGradeNotFoundError,
  PurchaseDocumentNotFoundError,
  PurchaseLineTotalMismatchError,
  ResourceInUseError,
  SalePaymentSplitError,
  SeededResourceDeleteForbiddenError,
  TripClosedError,
  TripNotEmptyError,
  TripNotFoundError,
  TripShortageExceedsNetError,
  WarehouseCodeConflictError,
  WarehouseNotFoundError,
} from "../application/errors.js";

export function sendMappedError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: "validation_error",
      details: error.flatten(),
    });
  }
  if (error instanceof BatchNotFoundError) {
    return reply.code(404).send({
      error: "batch_not_found",
      batchId: error.batchId,
    });
  }
  if (error instanceof TripNotFoundError) {
    return reply.code(404).send({
      error: "trip_not_found",
      tripId: error.tripId,
    });
  }
  if (error instanceof CounterpartyNotFoundError) {
    return reply.code(404).send({
      error: "counterparty_not_found",
      counterpartyId: error.counterpartyId,
    });
  }
  if (error instanceof PurchaseDocumentNotFoundError) {
    return reply.code(404).send({
      error: "purchase_document_not_found",
      documentId: error.documentId,
    });
  }
  if (error instanceof SeededResourceDeleteForbiddenError) {
    return reply.code(409).send({
      error: "seeded_resource_delete_forbidden",
      message: error.message,
    });
  }
  if (error instanceof ResourceInUseError) {
    return reply.code(409).send({
      error: "resource_in_use",
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof WarehouseNotFoundError) {
    return reply.code(400).send({
      error: "warehouse_not_found",
      warehouseId: error.warehouseId,
    });
  }
  if (error instanceof WarehouseCodeConflictError) {
    return reply.code(409).send({
      error: "warehouse_code_conflict",
      code: error.code,
    });
  }
  if (error instanceof ProductGradeNotFoundError) {
    return reply.code(400).send({
      error: "product_grade_not_found",
      productGradeId: error.productGradeId,
    });
  }
  if (error instanceof ProductGradeCodeConflictError) {
    return reply.code(409).send({
      error: "product_grade_code_conflict",
      code: error.code,
    });
  }
  if (error instanceof PurchaseLineTotalMismatchError) {
    return reply.code(400).send({
      error: "purchase_line_total_mismatch",
      lineIndex: error.lineIndex,
      expectedKopecks: error.expectedKopecks,
      actualKopecks: error.actualKopecks,
    });
  }
  if (error instanceof TripNotEmptyError) {
    return reply.code(409).send({
      error: "trip_not_empty",
      tripId: error.tripId,
      message: error.message,
    });
  }
  if (error instanceof TripClosedError) {
    return reply.code(409).send({
      error: "trip_closed",
      tripId: error.tripId,
    });
  }
  if (error instanceof InsufficientStockForTripError) {
    return reply.code(409).send({
      error: "insufficient_stock_for_trip",
      tripId: error.tripId,
      batchId: error.batchId,
      availableGrams: error.availableGrams.toString(),
      requestedGrams: error.requestedGrams.toString(),
    });
  }
  if (error instanceof SalePaymentSplitError) {
    return reply.code(400).send({
      error: "sale_payment_split_invalid",
      message: error.message,
    });
  }
  if (error instanceof TripShortageExceedsNetError) {
    return reply.code(409).send({
      error: "trip_shortage_exceeds_net",
      tripId: error.tripId,
      batchId: error.batchId,
      availableGrams: error.availableGrams.toString(),
      requestedGrams: error.requestedGrams.toString(),
    });
  }
  if (error instanceof InsufficientStockError) {
    return reply.code(409).send({
      error: "insufficient_stock",
      context: error.context,
      availableKg: error.availableKg,
      requestedKg: error.requestedKg,
      message: error.message,
    });
  }
  if (error instanceof InvalidKgError) {
    return reply.code(400).send({
      error: "invalid_kg",
      field: error.field,
      value: error.value,
    });
  }
  throw error;
}
