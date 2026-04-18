import {
  createTripBodySchema,
  receiveOnWarehouseSyncPayloadSchema,
  recordTripShortageSyncPayloadSchema,
  sellFromTripSyncPayloadSchema,
  shipToTripSyncPayloadSchema,
} from "@birzha/contracts";
import { z } from "zod";

const deviceEnvelope = z.object({
  deviceId: z.string().min(1),
  localActionId: z.string().min(1),
});

export const syncRequestSchema = z.discriminatedUnion("actionType", [
  deviceEnvelope.extend({
    actionType: z.literal("sell_from_trip"),
    payload: sellFromTripSyncPayloadSchema,
  }),
  deviceEnvelope.extend({
    actionType: z.literal("ship_to_trip"),
    payload: shipToTripSyncPayloadSchema,
  }),
  deviceEnvelope.extend({
    actionType: z.literal("record_trip_shortage"),
    payload: recordTripShortageSyncPayloadSchema,
  }),
  deviceEnvelope.extend({
    actionType: z.literal("receive_on_warehouse"),
    payload: receiveOnWarehouseSyncPayloadSchema,
  }),
  deviceEnvelope.extend({
    actionType: z.literal("create_trip"),
    payload: createTripBodySchema,
  }),
]);

export type SyncRequestBody = z.infer<typeof syncRequestSchema>;
