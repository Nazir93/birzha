import { describe, expect, it } from "vitest";

import {
  createBatchBodySchema,
  createTripBodySchema,
  createProductGradeBodySchema,
  createWarehouseBodySchema,
  loginBodySchema,
  receiveBodySchema,
  receiveOnWarehouseSyncPayloadSchema,
  recordTripShortageBodySchema,
  recordTripShortageSyncPayloadSchema,
  sellFromTripBodySchema,
  sellFromTripSyncPayloadSchema,
  shipBodySchema,
  shipToTripSyncPayloadSchema,
} from "./http-bodies.js";

describe("loginBodySchema", () => {
  it("принимает логин и пароль", () => {
    const r = loginBodySchema.parse({ login: "admin", password: "x" });
    expect(r.login).toBe("admin");
  });
});

describe("createBatchBodySchema", () => {
  it("принимает валидное тело", () => {
    const r = createBatchBodySchema.parse({
      id: "b1",
      purchaseId: "p1",
      totalKg: 10,
      pricePerKg: 0,
      distribution: "on_hand",
    });
    expect(r.totalKg).toBe(10);
  });

  it("отклоняет totalKg <= 0", () => {
    expect(() =>
      createBatchBodySchema.parse({
        id: "b1",
        purchaseId: "p1",
        totalKg: 0,
        pricePerKg: 1,
        distribution: "on_hand",
      }),
    ).toThrow();
  });
});

describe("sellFromTripBodySchema (mixed)", () => {
  const base = {
    tripId: "t1",
    kg: 1,
    saleId: "s1",
    pricePerKg: 10,
  };

  it("без paymentKind: ок без cashKopecksMixed (refine только для mixed)", () => {
    expect(() => sellFromTripBodySchema.parse(base)).not.toThrow();
  });

  it("paymentKind=mixed без cashKopecksMixed — ошибка", () => {
    expect(() =>
      sellFromTripBodySchema.parse({
        ...base,
        paymentKind: "mixed" as const,
      }),
    ).toThrow();
  });

  it("paymentKind=mixed со строкой копеек — ок", () => {
    const r = sellFromTripBodySchema.parse({
      ...base,
      paymentKind: "mixed" as const,
      cashKopecksMixed: "5000",
    });
    expect(r.cashKopecksMixed).toBe("5000");
  });

  it("paymentKind=mixed с числом копеек — ок", () => {
    const r = sellFromTripBodySchema.parse({
      ...base,
      paymentKind: "mixed" as const,
      cashKopecksMixed: 5000,
    });
    expect(r.cashKopecksMixed).toBe(5000);
  });

  it("clientLabel опционально, длина ≤ 120", () => {
    const r = sellFromTripBodySchema.parse({ ...base, clientLabel: "  Магазин  " });
    expect(r.clientLabel).toBe("  Магазин  ");
    expect(() =>
      sellFromTripBodySchema.parse({ ...base, clientLabel: "x".repeat(121) }),
    ).toThrow();
  });
});

describe("sellFromTripSyncPayloadSchema", () => {
  it("требует batchId и те же правила mixed", () => {
    expect(() =>
      sellFromTripSyncPayloadSchema.parse({
        batchId: "b1",
        tripId: "t1",
        kg: 1,
        saleId: "s1",
        pricePerKg: 1,
        paymentKind: "mixed",
      }),
    ).toThrow();

    const ok = sellFromTripSyncPayloadSchema.parse({
      batchId: "b1",
      tripId: "t1",
      kg: 1,
      saleId: "s1",
      pricePerKg: 1,
      paymentKind: "mixed",
      cashKopecksMixed: "100",
    });
    expect(ok.batchId).toBe("b1");
  });
});

describe("receiveBodySchema", () => {
  it("принимает положительный kg", () => {
    expect(receiveBodySchema.parse({ kg: 0.1 }).kg).toBe(0.1);
  });

  it("отклоняет kg <= 0", () => {
    expect(() => receiveBodySchema.parse({ kg: 0 })).toThrow();
    expect(() => receiveBodySchema.parse({ kg: -1 })).toThrow();
  });
});

describe("receiveOnWarehouseSyncPayloadSchema", () => {
  it("требует batchId и валидный receive", () => {
    const r = receiveOnWarehouseSyncPayloadSchema.parse({
      batchId: "b1",
      kg: 5,
    });
    expect(r).toEqual({ batchId: "b1", kg: 5 });
  });

  it("отклоняет без batchId", () => {
    expect(() => receiveOnWarehouseSyncPayloadSchema.parse({ kg: 1 } as never)).toThrow();
  });
});

describe("shipBodySchema", () => {
  it("принимает отгрузку в рейс", () => {
    const r = shipBodySchema.parse({ tripId: "t1", kg: 3 });
    expect(r).toEqual({ tripId: "t1", kg: 3 });
  });

  it("отклоняет пустой tripId", () => {
    expect(() => shipBodySchema.parse({ tripId: "", kg: 1 })).toThrow();
  });
});

describe("shipToTripSyncPayloadSchema", () => {
  it("объединяет batchId и ship body", () => {
    const r = shipToTripSyncPayloadSchema.parse({
      batchId: "b1",
      tripId: "t1",
      kg: 2,
    });
    expect(r).toEqual({ batchId: "b1", tripId: "t1", kg: 2 });
  });

  it("принимает packageCount", () => {
    const r = shipToTripSyncPayloadSchema.parse({
      batchId: "b1",
      tripId: "t1",
      kg: 2,
      packageCount: 5,
    });
    expect(r.packageCount).toBe(5);
  });
});

describe("recordTripShortageBodySchema", () => {
  it("принимает фиксацию недостачи", () => {
    const r = recordTripShortageBodySchema.parse({
      tripId: "t1",
      kg: 0.5,
      reason: "порча",
    });
    expect(r.reason).toBe("порча");
  });

  it("отклоняет пустой reason", () => {
    expect(() =>
      recordTripShortageBodySchema.parse({
        tripId: "t1",
        kg: 1,
        reason: "",
      }),
    ).toThrow();
  });
});

describe("recordTripShortageSyncPayloadSchema", () => {
  it("добавляет batchId к телу недостачи", () => {
    const r = recordTripShortageSyncPayloadSchema.parse({
      batchId: "b1",
      tripId: "t1",
      kg: 0.5,
      reason: "порча",
    });
    expect(r.batchId).toBe("b1");
    expect(r.reason).toBe("порча");
  });
});

describe("createProductGradeBodySchema", () => {
  it("принимает код и подпись", () => {
    const r = createProductGradeBodySchema.parse({
      code: "№9",
      displayName: "Калибр №9",
      sortOrder: 9,
    });
    expect(r.code).toBe("№9");
    expect(r.sortOrder).toBe(9);
  });
});

describe("createWarehouseBodySchema", () => {
  it("принимает только название", () => {
    const r = createWarehouseBodySchema.parse({ name: "  Склад А  " });
    expect(r.name).toBe("Склад А");
    expect(r.code).toBeUndefined();
  });

  it("принимает латинский код", () => {
    const r = createWarehouseBodySchema.parse({ name: "А", code: "SITE-1" });
    expect(r.code).toBe("SITE-1");
  });

  it("отклоняет кириллицу в code", () => {
    expect(() => createWarehouseBodySchema.parse({ name: "А", code: "Склад" })).toThrow();
  });
});

describe("createTripBodySchema", () => {
  it("принимает id и tripNumber", () => {
    const r = createTripBodySchema.parse({
      id: "trip-1",
      tripNumber: "Ф-01",
    });
    expect(r).toEqual({ id: "trip-1", tripNumber: "Ф-01" });
  });

  it("отклоняет пустой id", () => {
    expect(() =>
      createTripBodySchema.parse({
        id: "",
        tripNumber: "1",
      }),
    ).toThrow();
  });
});
