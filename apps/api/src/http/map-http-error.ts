import {
  InsufficientStockError,
  InvalidKgError,
  InvalidPackageTareError,
} from "@birzha/domain";
import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

import { gramsToKg } from "../application/units/mass.js";

import {
  BatchNotFoundError,
  CounterpartyNotFoundError,
  InsufficientStockForTripError,
  ProductGradeCodeConflictError,
  ProductGradeNotFoundError,
  LoadingManifestNotEmptyError,
  LoadingManifestNotFoundError,
  LoadingManifestNumberConflictError,
  LoadingManifestReturnAdjustForbiddenError,
  LoadingManifestTripDetachForbiddenError,
  PurchaseDocumentLinesLockedError,
  PurchaseDocumentNotFoundError,
  PurchaseLineTotalMismatchError,
  ResourceInUseError,
  SalePaymentSplitError,
  SeededResourceDeleteForbiddenError,
  TripArchiveDeleteRequiresClosedError,
  TripClosedError,
  TripNotEmptyError,
  TripNotFoundError,
  TripSellerCrossWarehouseLoadingError,
  TripSaleEditForbiddenError,
  TripSaleLineNotFoundError,
  TripShortageExceedsNetError,
  WarehouseCodeConflictError,
  WarehouseNameConflictError,
  WarehouseNotFoundError,
  WarehouseWriteOffNotFoundError,
  WholesalerNotFoundError,
  SupplierNotFoundError,
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
  if (error instanceof WarehouseWriteOffNotFoundError) {
    return reply.code(404).send({
      error: "warehouse_write_off_not_found",
      writeOffId: error.writeOffId,
      message: error.message,
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
  if (error instanceof WholesalerNotFoundError) {
    return reply.code(404).send({
      error: "wholesaler_not_found",
      wholesalerId: error.wholesalerId,
    });
  }
  if (error instanceof SupplierNotFoundError) {
    return reply.code(404).send({
      error: "supplier_not_found",
      supplierId: error.supplierId,
      message: error.message,
    });
  }
  if (error instanceof PurchaseDocumentNotFoundError) {
    return reply.code(404).send({
      error: "purchase_document_not_found",
      documentId: error.documentId,
    });
  }
  if (error instanceof PurchaseDocumentLinesLockedError) {
    return reply.code(409).send({
      error: "purchase_document_lines_locked",
      documentId: error.documentId,
      reason: error.reason,
      message: error.message,
    });
  }
  if (error instanceof LoadingManifestNotFoundError) {
    return reply.code(404).send({
      error: "loading_manifest_not_found",
      manifestId: error.manifestId,
    });
  }
  if (error instanceof LoadingManifestNotEmptyError) {
    return reply.code(409).send({
      error: "loading_manifest_not_empty",
      manifestId: error.manifestId,
      message: error.message,
    });
  }
  if (error instanceof LoadingManifestTripDetachForbiddenError) {
    return reply.code(409).send({
      error: "loading_manifest_trip_detach_forbidden",
      manifestId: error.manifestId,
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof LoadingManifestReturnAdjustForbiddenError) {
    return reply.code(409).send({
      error: "loading_manifest_return_adjust_forbidden",
      batchId: error.batchId,
      code: error.code,
      message: error.message,
    });
  }
  if (error instanceof LoadingManifestNumberConflictError) {
    return reply.code(409).send({
      error: "loading_manifest_number_conflict",
      manifestNumber: error.manifestNumber,
      message: error.message,
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
  if (error instanceof WarehouseNameConflictError) {
    return reply.code(409).send({
      error: "warehouse_name_conflict",
      name: error.warehouseName,
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
  if (error instanceof TripArchiveDeleteRequiresClosedError) {
    return reply.code(409).send({
      error: "trip_archive_delete_requires_closed",
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
  if (error instanceof TripSellerCrossWarehouseLoadingError) {
    return reply.code(409).send({
      error: "trip_seller_assigned_cross_warehouse",
      tripId: error.tripId,
      warehouseId: error.warehouseId,
      message: error.message,
    });
  }
  if (error instanceof TripSaleLineNotFoundError) {
    return reply.code(404).send({
      error: "trip_sale_line_not_found",
      lineId: error.lineId,
    });
  }
  if (error instanceof TripSaleEditForbiddenError) {
    return reply.code(403).send({
      error: "trip_sale_edit_forbidden",
      message: error.message,
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
      availableKg: gramsToKg(error.availableGrams),
      requestedKg: gramsToKg(error.requestedGrams),
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
  if (error instanceof InvalidPackageTareError) {
    return reply.code(400).send({
      error: "invalid_package_tare",
      message: error.message,
    });
  }
  throw error;
}
