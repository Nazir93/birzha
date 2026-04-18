import { ZodError } from "zod";

const PATH_LABELS: Record<string, string> = {
  id: "ID",
  purchaseId: "ID закупки",
  totalKg: "totalKg, кг",
  pricePerKg: "pricePerKg, руб/кг",
  distribution: "distribution",
  kg: "кг",
  tripId: "tripId",
  saleId: "saleId",
  paymentKind: "paymentKind",
  cashKopecksMixed: "cashKopecksMixed",
  reason: "причина",
  tripNumber: "номер рейса",
};

export function zodErrorMessage(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "";
      const label = path ? (PATH_LABELS[path] ?? path) : "форма";
      return `${label}: ${issue.message}`;
    })
    .join("\n");
}
