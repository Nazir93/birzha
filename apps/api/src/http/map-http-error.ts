import {
  InsufficientStockError,
  InvalidKgError,
} from "@birzha/domain";
import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

import {
  BatchNotFoundError,
  InsufficientStockForTripError,
  SalePaymentSplitError,
  TripClosedError,
  TripNotFoundError,
  TripShortageExceedsNetError,
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
