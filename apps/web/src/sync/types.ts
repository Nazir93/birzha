/**
 * Элемент очереди (без deviceId — добавляется при POST /sync).
 * Поля совместимы с `syncRequestSchema` в API.
 */
export type OutboxItem = {
  localActionId: string;
  createdAt: number;
} & (
  | {
      actionType: "sell_from_trip";
      payload: {
        batchId: string;
        tripId: string;
        kg: number;
        saleId: string;
        pricePerKg: number;
        paymentKind?: "cash" | "debt" | "mixed";
        cashKopecksMixed?: string | number;
      };
    }
  | {
      actionType: "ship_to_trip";
      payload: { batchId: string; tripId: string; kg: number };
    }
  | {
      actionType: "record_trip_shortage";
      payload: { batchId: string; tripId: string; kg: number; reason: string };
    }
  | {
      actionType: "receive_on_warehouse";
      payload: { batchId: string; kg: number };
    }
  | {
      actionType: "create_trip";
      payload: { id: string; tripNumber: string };
    }
);

export type SyncOkResponse = { status: "ok"; actionId: string; duplicate?: boolean };

export type SyncRejectedResponse = {
  status: "rejected";
  actionId: string;
  reason: string;
  resolution: string;
  errorCode?: string;
  details?: Record<string, unknown>;
};

export type SyncResponse = SyncOkResponse | SyncRejectedResponse;
