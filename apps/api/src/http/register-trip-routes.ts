import type { FastifyInstance, FastifyRequest } from "fastify";
import { createTripBodySchema } from "@birzha/contracts";
import { z } from "zod";

import { isGlobalSellerOnly } from "../auth/seller-scope.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import { TripNotFoundError } from "../application/errors.js";
import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../application/ports/trip-shortage-repository.port.js";
import { CloseTripUseCase } from "../application/trip/close-trip.use-case.js";
import { CreateTripUseCase } from "../application/trip/create-trip.use-case.js";
import { DeleteTripUseCase } from "../application/trip/delete-trip.use-case.js";
import { GetTripReportUseCase } from "../application/trip/get-trip-report.use-case.js";

import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";
import {
  ledgerAggregateToJson,
  saleLedgerAggregateToJson,
  shipmentLedgerToJson,
  tripFinancialsToJson,
} from "./trip-report-serialize.js";
import { tripToJson } from "./trip-serialize.js";

type JwtRequestUser = { sub: string; login: string; roles: AuthRoleGrant[] };

export function registerTripRoutes(
  app: FastifyInstance,
  trips: TripRepository,
  shipments: TripShipmentRepository,
  sales: TripSaleRepository,
  shortages: TripShortageRepository,
  batches: BatchRepository,
  routeAuth: BusinessRouteAuth,
): void {
  const createTrip = new CreateTripUseCase(trips);
  const closeTrip = new CloseTripUseCase(trips);
  const deleteTrip = new DeleteTripUseCase(trips, shipments, sales, shortages);
  const tripReport = new GetTripReportUseCase(trips, shipments, sales, shortages, batches);

  app.get("/trips", { ...withPreHandlers(routeAuth.dataRead) }, async (_req, reply) => {
    try {
      const list = await trips.list();
      return reply.send({ trips: list.map(tripToJson) });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/trips/:tripId/shipment-report", { ...withPreHandlers(routeAuth.tripReportRead) }, async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      const onlySales = u && isGlobalSellerOnly(u.roles) ? u.sub : undefined;
      const { trip, shipment, sales: saleAgg, shortage: shortageAgg, financials } = await tripReport.execute(
        tripId,
        onlySales ? { onlySalesRecordedByUserId: onlySales } : undefined,
      );
      return reply.send({
        trip: tripToJson(trip),
        shipment: shipmentLedgerToJson(shipment),
        sales: saleLedgerAggregateToJson(saleAgg),
        shortage: ledgerAggregateToJson(shortageAgg),
        financials: tripFinancialsToJson(financials),
      });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/trips/:tripId", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      const trip = await trips.findById(tripId);
      if (!trip) {
        throw new TripNotFoundError(tripId);
      }
      return reply.send({ trip: tripToJson(trip) });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/trips", { ...withPreHandlers(routeAuth.tripWrite) }, async (req, reply) => {
    try {
      const body = createTripBodySchema.parse(req.body);
      await createTrip.execute(body);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/trips/:tripId/close", { ...withPreHandlers(routeAuth.tripWrite) }, async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      await closeTrip.execute(tripId);
      return reply.code(200).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.delete("/trips/:tripId", { ...withPreHandlers(routeAuth.tripWrite) }, async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      await deleteTrip.execute(tripId);
      return reply.code(204).send();
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
