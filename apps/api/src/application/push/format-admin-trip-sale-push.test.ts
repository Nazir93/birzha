import { describe, expect, it } from "vitest";

import { formatAdminTripSalePush } from "./format-admin-trip-sale-push.js";

describe("formatAdminTripSalePush", () => {
  it("собирает подробный текст: калибр, кг, цена, продавец, время", () => {
    const msg = formatAdminTripSalePush({
      caliberLabel: "Помидоры · №5",
      kg: 50,
      packageCount: 10,
      pricePerKg: 180,
      revenueRub: 9000,
      saleChannel: "wholesale",
      clientLabel: "Опт Север",
      sellerLogin: "seller1",
      tripNumber: "01",
      destinationLabel: "Москва",
      vehicleLabel: "444",
      productGroup: "Помидоры",
      at: new Date("2026-09-24T09:40:00.000Z"),
    });

    expect(msg.title).toBe("Продажа · рейс 01");
    expect(msg.body).toContain("Помидоры · №5");
    expect(msg.body).toContain("50 кг");
    expect(msg.body).toContain("10 ящ.");
    expect(msg.body).toContain("180 ₽/кг");
    expect(msg.body).toMatch(/9[\s\u00a0\u202f]?000\s*₽/);
    expect(msg.body).toContain("опт");
    expect(msg.body).toContain("Опт Север");
    expect(msg.body).toContain("продавец seller1");
    expect(msg.body).toContain("Москва");
    expect(msg.body).toMatch(/24\.09\.2026/);
  });

  it("розница без клиента и ящиков", () => {
    const msg = formatAdminTripSalePush({
      caliberLabel: "№6",
      kg: 12.5,
      packageCount: null,
      pricePerKg: 100,
      revenueRub: 1250,
      saleChannel: "retail",
      clientLabel: null,
      sellerLogin: null,
      tripNumber: "02",
      destinationLabel: null,
      vehicleLabel: null,
      productGroup: null,
      at: new Date("2026-09-24T10:00:00.000Z"),
    });

    expect(msg.body).toContain("розница");
    expect(msg.body).toContain("продавец —");
    expect(msg.body).not.toContain("ящ.");
  });
});
