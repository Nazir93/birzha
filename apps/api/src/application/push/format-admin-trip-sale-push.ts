export type AdminTripSalePushInput = {
  caliberLabel: string;
  kg: number;
  packageCount: number | null;
  pricePerKg: number;
  revenueRub: number;
  saleChannel: "retail" | "wholesale";
  clientLabel: string | null;
  sellerLogin: string | null;
  tripNumber: string;
  destinationLabel: string | null;
  vehicleLabel: string | null;
  productGroup: string | null;
  at: Date;
};

export type AdminTripSalePushMessage = {
  title: string;
  body: string;
};

function formatKg(kg: number): string {
  if (!Number.isFinite(kg)) {
    return "—";
  }
  const rounded = Math.round(kg * 1000) / 1000;
  return `${rounded.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} кг`;
}

function formatMoneyRub(rub: number): string {
  if (!Number.isFinite(rub)) {
    return "—";
  }
  return `${rub.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
}

function formatPricePerKg(price: number): string {
  if (!Number.isFinite(price)) {
    return "—";
  }
  return `${price.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽/кг`;
}

function formatTimeRu(at: Date): string {
  const d = at.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
  });
  const t = at.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
  return `${d} ${t}`;
}

/**
 * Текст push для админа: калибр, вес, цена, продавец, время (+ рейс/канал).
 */
export function formatAdminTripSalePush(input: AdminTripSalePushInput): AdminTripSalePushMessage {
  const tripBits = [`рейс ${input.tripNumber.trim() || "—"}`];
  if (input.destinationLabel?.trim()) {
    tripBits.push(input.destinationLabel.trim());
  }
  if (input.productGroup?.trim()) {
    tripBits.push(input.productGroup.trim());
  }
  if (input.vehicleLabel?.trim()) {
    tripBits.push(input.vehicleLabel.trim());
  }

  const title = `Продажа · ${tripBits[0]}`;

  const line1Parts = [input.caliberLabel.trim() || "Калибр не указан", formatKg(input.kg)];
  if (input.packageCount != null && input.packageCount > 0) {
    line1Parts.push(`${input.packageCount} ящ.`);
  }

  const line2Parts = [formatPricePerKg(input.pricePerKg), formatMoneyRub(input.revenueRub)];
  line2Parts.push(input.saleChannel === "wholesale" ? "опт" : "розница");
  if (input.clientLabel?.trim()) {
    line2Parts.push(input.clientLabel.trim());
  }

  const line3Parts = [
    `продавец ${input.sellerLogin?.trim() || "—"}`,
    formatTimeRu(input.at),
  ];
  if (tripBits.length > 1) {
    line3Parts.unshift(tripBits.slice(1).join(" · "));
  }

  const body = [line1Parts.join(" · "), line2Parts.join(" · "), line3Parts.join(" · ")].join("\n");

  return { title, body };
}
