import type { FastifyInstance, FastifyRequest } from "fastify";
import { assignTripSellerBodySchema, createTripBodySchema, updateTripHeaderBodySchema } from "@birzha/contracts";
import { z } from "zod";

import { isGlobalSellerOnly, tripVisibleToFieldSeller } from "../auth/seller-scope.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import { TripNotFoundError } from "../application/errors.js";
import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { TripArchiveManifestCleanupPort } from "../application/ports/trip-archive-manifest-cleanup.port.js";
import type { TripListFilter, TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../application/ports/trip-shortage-repository.port.js";
import { AssignTripSellerUseCase } from "../application/trip/assign-trip-seller.use-case.js";
import { CloseTripUseCase } from "../application/trip/close-trip.use-case.js";
import { CreateTripUseCase } from "../application/trip/create-trip.use-case.js";
import { DeleteTripUseCase } from "../application/trip/delete-trip.use-case.js";
import { GetTripReportUseCase } from "../application/trip/get-trip-report.use-case.js";
import { UpdateTripHeaderUseCase } from "../application/trip/update-trip-header.use-case.js";
import { computeTripTransitDigest } from "../application/trip/trip-transit-digest.js";

import { sendMappedError } from "./map-http-error.js";
import { type BusinessRouteAuth, withPreHandlers } from "./route-auth.js";
import { assertActiveShipDestination } from "./register-ship-destination-routes.js";
import type { DbClient } from "../db/client.js";
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
  listAssignableFieldSellers?: () => Promise<{ id: string; login: string }[]>,
  manifestCleanup?: TripArchiveManifestCleanupPort,
  db: DbClient | null = null,
): void {
  const createTrip = new CreateTripUseCase(trips);
  const assignTripSeller = new AssignTripSellerUseCase(trips);
  const closeTrip = new CloseTripUseCase(trips);
  const deleteTrip = new DeleteTripUseCase(trips, shipments, sales, shortages, manifestCleanup);
  const updateTripHeader = new UpdateTripHeaderUseCase(trips);
  const tripReport = new GetTripReportUseCase(trips, shipments, sales, shortages, batches);
  const listFieldSellers = listAssignableFieldSellers ?? (async () => []);

  const tripsListQuerySchema = z.object({
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    order: z.enum(["tripNumber", "departedAtDesc"]).optional(),
    status: z.enum(["open", "closed"]).optional(),
    assignedSellerUserId: z.string().min(1).optional(),
  });

  app.get("/trips", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const raw = req.query as Record<string, string | undefined>;
      const parsed = tripsListQuerySchema.safeParse(raw);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_query", issues: parsed.error.flatten() });
      }
      const d = parsed.data;
      const limit = d.limit ?? 100;
      const offset = d.offset ?? 0;
      const filter: TripListFilter = {
        search: d.search?.trim() || undefined,
        limit,
        offset,
        order: d.order === "tripNumber" ? "tripNumberAsc" : "departedAtDesc",
        status: d.status,
      };
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      if (d.assignedSellerUserId) {
        filter.assignedSellerUserId = d.assignedSellerUserId;
      } else if (u && isGlobalSellerOnly(u.roles)) {
        filter.assignedSellerUserId = u.sub;
      }
      const [list, totalCount] = await Promise.all([trips.list(filter), trips.count(filter)]);
      const listMeta = { limit, offset, hasMore: offset + list.length < totalCount, totalCount };

      const toJson = async (trip: (typeof list)[number]) => {
        if (trip.getStatus() === "closed") {
          return tripToJson(trip);
        }
        const tripId = trip.getId();
        const [shipment, saleAgg, shortageAgg] = await Promise.all([
          shipments.aggregateByTripId(tripId),
          sales.aggregateByTripId(tripId),
          shortages.aggregateByTripId(tripId),
        ]);
        const digest = computeTripTransitDigest(shipment, saleAgg, shortageAgg);
        return tripToJson(trip, {
          transitRemainingGrams: digest.remainingNetTransitGrams.toString(),
          hasShipmentToTrip: digest.hasShipmentToTrip,
          shippedGrams: digest.totalShippedGrams.toString(),
          soldGrams: digest.totalSoldGrams.toString(),
        });
      };

      const tripsPayload = await Promise.all(list.map(toJson));
      return reply.send({ trips: tripsPayload, listMeta });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/trips/field-seller-options", { ...withPreHandlers(routeAuth.tripAssignSeller) }, async (_req, reply) => {
    try {
      const fieldSellers = await listFieldSellers();
      return reply.send({ fieldSellers });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.get("/trips/:tripId/shipment-report", { ...withPreHandlers(routeAuth.tripReportRead) }, async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      const tripRow = await trips.findById(tripId);
      if (!tripRow) {
        throw new TripNotFoundError(tripId);
      }
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      if (u && isGlobalSellerOnly(u.roles) && !tripVisibleToFieldSeller(tripRow, u.sub)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const onlySales = u && isGlobalSellerOnly(u.roles) ? u.sub : undefined;
      const { trip, shipment, sales: saleAgg, salesForTripStock, shortage: shortageAgg, financials } =
        await tripReport.execute(tripId, onlySales ? { onlySalesRecordedByUserId: onlySales } : undefined);
      return reply.send({
        trip: tripToJson(trip),
        shipment: shipmentLedgerToJson(shipment),
        sales: saleLedgerAggregateToJson(saleAgg),
        ...(salesForTripStock ? { salesForTripStock: saleLedgerAggregateToJson(salesForTripStock) } : {}),
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
      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      if (u && isGlobalSellerOnly(u.roles) && !tripVisibleToFieldSeller(trip, u.sub)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      return reply.send({ trip: tripToJson(trip) });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/trips", { ...withPreHandlers(routeAuth.tripWrite) }, async (req, reply) => {
    try {
      const body = createTripBodySchema.parse(req.body);
      const dest = body.destinationCode?.trim();
      if (dest && db) {
        const ok = await assertActiveShipDestination(db, dest);
        if (!ok) {
          return reply.code(400).send({
            error: "invalid_ship_destination",
            message: "Город не найден или снят в справочнике. Верните его в настройках или выберите другой.",
          });
        }
      }
      await createTrip.execute(body);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.post("/trips/:tripId/assign-seller", { ...withPreHandlers(routeAuth.tripAssignSeller) }, async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      const body = assignTripSellerBodySchema.parse(req.body);
      const sellers = await listFieldSellers();
      if (sellers.length > 0 && !sellers.some((s) => s.id === body.sellerUserId)) {
        return reply.code(400).send({ error: "seller_user_not_assignable", sellerUserId: body.sellerUserId });
      }
      await assignTripSeller.execute({ tripId, sellerUserId: body.sellerUserId });
      const trip = await trips.findById(tripId);
      return reply.code(200).send({ ok: true, trip: trip ? tripToJson(trip) : null });
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
      const query = z.object({ fromArchive: z.enum(["1"]).optional() }).parse(req.query);
      await deleteTrip.execute(tripId, { fromArchive: query.fromArchive === "1" });
      return reply.code(204).send();
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });

  app.patch("/trips/:tripId", { ...withPreHandlers(routeAuth.tripWrite) }, async (req, reply) => {
    try {
      const { tripId } = z.object({ tripId: z.string().min(1) }).parse(req.params);
      const body = updateTripHeaderBodySchema.parse(req.body);
      await updateTripHeader.execute(tripId, body);
      return reply.code(204).send();
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
