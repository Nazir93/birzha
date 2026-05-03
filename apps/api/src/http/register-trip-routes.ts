import type { FastifyInstance, FastifyRequest } from "fastify";
import { assignTripSellerBodySchema, createTripBodySchema } from "@birzha/contracts";
import { z } from "zod";

import { isGlobalSellerOnly, tripVisibleToFieldSeller } from "../auth/seller-scope.js";
import type { AuthRoleGrant } from "../auth/role-grant.js";
import { TripNotFoundError } from "../application/errors.js";
import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { TripListFilter, TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../application/ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../application/ports/trip-shortage-repository.port.js";
import { AssignTripSellerUseCase } from "../application/trip/assign-trip-seller.use-case.js";
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
  listAssignableFieldSellers?: () => Promise<{ id: string; login: string }[]>,
): void {
  const createTrip = new CreateTripUseCase(trips);
  const assignTripSeller = new AssignTripSellerUseCase(trips);
  const closeTrip = new CloseTripUseCase(trips);
  const deleteTrip = new DeleteTripUseCase(trips, shipments, sales, shortages);
  const tripReport = new GetTripReportUseCase(trips, shipments, sales, shortages, batches);
  const listFieldSellers = listAssignableFieldSellers ?? (async () => []);

  const tripsListQuerySchema = z.object({
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    order: z.enum(["tripNumber", "departedAtDesc"]).optional(),
  });

  app.get("/trips", { ...withPreHandlers(routeAuth.dataRead) }, async (req, reply) => {
    try {
      const raw = req.query as Record<string, string | undefined>;
      const pickerKeys = ["search", "limit", "offset", "order"] as const;
      const isPicker = pickerKeys.some((k) => raw[k] !== undefined && String(raw[k]).length > 0);

      let list;
      let listMeta: { limit: number; offset: number; hasMore: boolean } | undefined;

      if (!isPicker) {
        list = await trips.list();
      } else {
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
        };
        list = await trips.list(filter);
        listMeta = { limit, offset, hasMore: list.length === limit };
      }

      const u = (req as FastifyRequest & { user?: JwtRequestUser }).user;
      if (u && isGlobalSellerOnly(u.roles)) {
        list = list.filter((t) => tripVisibleToFieldSeller(t, u.sub));
      }
      if (listMeta) {
        return reply.send({ trips: list.map(tripToJson), listMeta });
      }
      return reply.send({ trips: list.map(tripToJson) });
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
      await deleteTrip.execute(tripId);
      return reply.code(204).send();
    } catch (error) {
      return sendMappedError(reply, error);
    }
  });
}
