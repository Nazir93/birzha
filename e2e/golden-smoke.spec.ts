import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  birzhaSelectTrigger,
  expectBirzhaSelectHasOption,
  labelPattern,
  pickBirzhaSelectByLabel,
  pickBirzhaSelectFirstRealOption,
} from "./birzha-select-helpers.js";
import { kopecksToRubLabel } from "./kopecks-label.js";

/** Как `apps/api/src/application/units/rub-kopecks.ts` — только для сверки с отчётом в E2E. */
function revenueKopecksFromGramsAndPricePerKg(grams: bigint, pricePerKgKopecks: bigint): bigint {
  return (grams * pricePerKgKopecks + 500n) / 1000n;
}

/**
 * Дымовой E2E: клиент + прокси + API (in-memory), без PostgreSQL.
 * Полная сходимость — в `apps/api/src/http/golden-scenario.flow.test.ts`.
 */
test.describe("золотой smoke (UI + API)", () => {
  test.describe.configure({ mode: "serial" });

  test("корень / → редирект на /o/reports", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/o\/reports$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });

  test("неизвестный путь → редирект на /o/reports (catch-all)", async ({ page }) => {
    await page.goto("/_e2e-no-such-route");
    await expect(page).toHaveURL(/\/o\/reports$/);
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });

  test("/login при выключенной обязательной авторизации → редирект на /o/reports", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/o\/reports$/);
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });

  test("GET /api/meta: batches включены", async ({ request }) => {
    const res = await request.get("/api/meta");
    expect(res.ok()).toBeTruthy();
    const meta = (await res.json()) as { batchesApi?: string };
    expect(meta.batchesApi).toBe("enabled");
  });

  test("отчёты: после POST /trips в селекторе появляется рейс", async ({ page, request }) => {
    const id = `e2e-smoke-trip-${Date.now()}`;
    const tripNumber = "E2E-SMOKE";
    const res = await request.post("/api/trips", {
      data: { id, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });

    const select = birzhaSelectTrigger(page, "#trip-select");
    await expect(select).toBeVisible({ timeout: 15_000 });
    await expectBirzhaSelectHasOption(page, "#trip-select", labelPattern(tripNumber));
  });

  test("отчёты: выбор рейса загружает блок отчёта (shipment-report)", async ({ page, request }) => {
    const id = `e2e-report-trip-${Date.now()}`;
    const tripNumber = "E2E-REPORT";
    const res = await request.post("/api/trips", {
      data: { id, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });

    await pickBirzhaSelectByLabel(page, "#trip-select", labelPattern(tripNumber));
    await expect(page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Отгрузка в рейс")).toBeVisible();
    await expect(page.getByText("Деньги (копейки → руб.)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть диалог печати отчёта по рейсу" })).toBeVisible();
  });

  test("отчёты: продажа с clientLabel — таблица «Продажи по клиентам»", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-cli-b-${suffix}`;
    const tripId = `e2e-cli-t-${suffix}`;
    const tripNumber = `CLI-${suffix.slice(-8)}`;
    const clientLabel = `E2E-Клиент-${suffix.slice(-6)}`;
    const saleId = `e2e-sale-${suffix}`;

    let res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `p-e2e-cli-${suffix}`,
        totalKg: 50,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 20, tripId },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/sell-from-trip`, {
      data: {
        tripId,
        kg: 5,
        saleId,
        pricePerKg: 100,
        paymentKind: "cash",
        clientLabel,
      },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });
    await pickBirzhaSelectByLabel(page, "#trip-select", labelPattern(tripNumber));
    await expect(page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Продажи по клиентам" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(clientLabel, { exact: true })).toBeVisible();
  });

  test("отчёты: недостача рейса в блоке «Массы, кг»", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-sh-b-${suffix}`;
    const tripId = `e2e-sh-t-${suffix}`;
    const tripNumber = `SH-${suffix.slice(-8)}`;

    let res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `p-e2e-sh-${suffix}`,
        totalKg: 80,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 20, tripId },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/record-trip-shortage`, {
      data: { tripId, kg: 2, reason: "e2e shortage row" },
    });
    expect(res.ok()).toBeTruthy();

    const reportRes = await request.get(`/api/trips/${tripId}/shipment-report`);
    expect(reportRes.ok()).toBeTruthy();
    const reportJson = (await reportRes.json()) as { shortage: { totalGrams: string } };
    expect(reportJson.shortage.totalGrams).toBe("2000");

    await page.goto("/o/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });
    await pickBirzhaSelectByLabel(page, "#trip-select", labelPattern(tripNumber));
    const region = page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` });
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(region.getByRole("heading", { name: "Массы, кг (из граммов)" })).toBeVisible();
    const shortageRow = region.locator("tr").filter({ hasText: "Недостача (фикс.)" });
    await expect(shortageRow).toContainText("2,000");
  });

  test("отчёты: продажа в долг — строка «Выручка: нал / долг»", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-debt-b-${suffix}`;
    const tripId = `e2e-debt-t-${suffix}`;
    const tripNumber = `DEBT-${suffix.slice(-8)}`;
    const saleId = `e2e-debt-sale-${suffix}`;

    let res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `p-e2e-debt-${suffix}`,
        totalKg: 40,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 10, tripId },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/sell-from-trip`, {
      data: {
        tripId,
        kg: 3,
        saleId,
        pricePerKg: 50,
        paymentKind: "debt",
      },
    });
    expect(res.ok()).toBeTruthy();

    const reportRes = await request.get(`/api/trips/${tripId}/shipment-report`);
    expect(reportRes.ok()).toBeTruthy();
    const report = (await reportRes.json()) as {
      sales: { totalCashKopecks: string; totalDebtKopecks: string; totalCardTransferKopecks: string };
    };
    expect(report.sales.totalCashKopecks).toBe("0");
    expect(report.sales.totalCardTransferKopecks).toBe("0");
    const cashLabel = kopecksToRubLabel("0");
    const cardLabel = kopecksToRubLabel(report.sales.totalCardTransferKopecks);
    const debtLabel = kopecksToRubLabel(report.sales.totalDebtKopecks);

    await page.goto("/o/reports");
    await pickBirzhaSelectByLabel(page, "#trip-select", labelPattern(tripNumber));
    const region = page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` });
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(region).toContainText(`${cashLabel} ₽ / ${cardLabel} ₽ / ${debtLabel} ₽`);
  });

  test("отчёты: смешанная оплата — нал/долг в UI совпадают с API", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-mx-b-${suffix}`;
    const tripId = `e2e-mx-t-${suffix}`;
    const tripNumber = `MIX-${suffix.slice(-8)}`;
    const saleId = `e2e-mx-sale-${suffix}`;
    // 4 кг × 25 ₽/кг → выручка 10_000 коп.; половина нал, половина долг
    const cashKopecksMixed = "5000";

    let res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `p-e2e-mx-${suffix}`,
        totalKg: 60,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 15, tripId },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/sell-from-trip`, {
      data: {
        tripId,
        kg: 4,
        saleId,
        pricePerKg: 25,
        paymentKind: "mixed",
        cashKopecksMixed,
        clientLabel: "E2E-Mixed",
      },
    });
    expect(res.ok()).toBeTruthy();

    const reportRes = await request.get(`/api/trips/${tripId}/shipment-report`);
    expect(reportRes.ok()).toBeTruthy();
    const report = (await reportRes.json()) as {
      sales: { totalCashKopecks: string; totalDebtKopecks: string; totalCardTransferKopecks: string };
    };
    expect(report.sales.totalCashKopecks).toBe("5000");
    expect(report.sales.totalDebtKopecks).toBe("5000");
    expect(report.sales.totalCardTransferKopecks).toBe("0");

    const cashLabel = kopecksToRubLabel(report.sales.totalCashKopecks);
    const cardLabel = kopecksToRubLabel(report.sales.totalCardTransferKopecks);
    const debtLabel = kopecksToRubLabel(report.sales.totalDebtKopecks);

    await page.goto("/o/reports");
    await pickBirzhaSelectByLabel(page, "#trip-select", labelPattern(tripNumber));
    const region = page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` });
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(region).toContainText(`${cashLabel} ₽ / ${cardLabel} ₽ / ${debtLabel} ₽`);
    await expect(page.getByRole("heading", { name: "Продажи по клиентам" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("E2E-Mixed", { exact: true })).toBeVisible();
  });

  test("отчёты: полный числовой сценарий как в golden-scenario.flow.test (5000 кг → отгрузка → недостача → продажа)", async ({
    page,
    request,
  }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-golden-b-${suffix}`;
    const tripId = `e2e-golden-t-${suffix}`;
    const tripNumber = `G-E2E-${suffix.slice(-8)}`;
    const saleId = `golden-sale-e2e-${suffix}`;
    const pricePerKgRub = 1;
    const sellKg = 2900;

    let res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `golden-purchase-e2e-${suffix}`,
        totalKg: 5000,
        pricePerKg: 40,
        distribution: "on_hand",
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 3000, tripId },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/record-trip-shortage`, {
      data: { tripId, kg: 100, reason: "недостача при приёмке" },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/sell-from-trip`, {
      data: {
        tripId,
        kg: sellKg,
        saleId,
        pricePerKg: pricePerKgRub,
        paymentKind: "debt",
        clientLabel: "ИП Иванов",
      },
    });
    expect(res.ok()).toBeTruthy();

    const reportRes = await request.get(`/api/trips/${tripId}/shipment-report`);
    expect(reportRes.ok()).toBeTruthy();
    const report = (await reportRes.json()) as {
      shipment: { totalGrams: string };
      sales: {
        totalGrams: string;
        totalRevenueKopecks: string;
        totalCashKopecks: string;
        totalDebtKopecks: string;
        totalCardTransferKopecks: string;
        byClient: { clientLabel: string; grams: string }[];
      };
      shortage: { totalGrams: string };
      financials: {
        revenueKopecks: string;
        costOfSoldKopecks: string;
        costOfShortageKopecks: string;
        grossProfitKopecks: string;
      };
    };

    const soldGrams = BigInt(sellKg) * 1000n;
    const priceKop = 100n;
    const purchaseKop = 4000n;
    const shortageGrams = 100n * 1000n;
    const expectedRevenue = revenueKopecksFromGramsAndPricePerKg(soldGrams, priceKop);
    const expectedCostSold = revenueKopecksFromGramsAndPricePerKg(soldGrams, purchaseKop);
    const expectedCostShortage = revenueKopecksFromGramsAndPricePerKg(shortageGrams, purchaseKop);
    const expectedGross = expectedRevenue - expectedCostSold - expectedCostShortage;

    expect(report.shipment.totalGrams).toBe("3000000");
    expect(report.shortage.totalGrams).toBe("100000");
    expect(report.sales.totalGrams).toBe(soldGrams.toString());
    expect(report.sales.totalRevenueKopecks).toBe(expectedRevenue.toString());
    expect(report.sales.totalCashKopecks).toBe("0");
    expect(report.sales.totalCardTransferKopecks).toBe("0");
    expect(report.sales.totalDebtKopecks).toBe(expectedRevenue.toString());
    expect(report.sales.byClient).toHaveLength(1);
    expect(report.sales.byClient[0].clientLabel).toBe("ИП Иванов");
    expect(report.financials.revenueKopecks).toBe(expectedRevenue.toString());
    expect(report.financials.costOfSoldKopecks).toBe(expectedCostSold.toString());
    expect(report.financials.costOfShortageKopecks).toBe(expectedCostShortage.toString());
    expect(report.financials.grossProfitKopecks).toBe(expectedGross.toString());

    await page.goto("/o/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });
    await pickBirzhaSelectByLabel(page, "#trip-select", labelPattern(tripNumber));
    const region = page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` });
    await expect(region).toBeVisible({ timeout: 15_000 });

    await expect(region.locator("tr").filter({ hasText: "Отгрузка в рейс" })).toContainText("3000,000");
    await expect(region.locator("tr").filter({ hasText: "Продажи" }).first()).toContainText("2900,000");
    await expect(region.locator("tr").filter({ hasText: "Недостача (фикс.)" })).toContainText("100,000");
    await expect(page.getByText("ИП Иванов", { exact: true })).toBeVisible();
    await expect(region).toContainText(`${kopecksToRubLabel(report.financials.grossProfitKopecks)} ₽`);
  });

  test("отчёты: после отгрузки доступен CSV сверки по партиям", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-csv-b-${suffix}`;
    const tripId = `e2e-csv-t-${suffix}`;
    const tripNumber = `CSV-${suffix.slice(-8)}`;

    let res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `p-e2e-${suffix}`,
        totalKg: 100,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 25, tripId },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });
    await pickBirzhaSelectByLabel(page, "#trip-select", labelPattern(tripNumber));
    await expect(page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` })).toBeVisible({
      timeout: 15_000,
    });

    const csvBtn = page.getByRole("button", { name: "Скачать таблицу сверки по партиям в CSV для Excel" });
    await expect(csvBtn).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download");
    await csvBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/partii\.csv$/i);

    const dlPath = await download.path();
    expect(dlPath).toBeTruthy();
    const text = await readFile(dlPath!, "utf8");
    expect(text).toContain("Рейс;");
    expect(text).toContain(tripNumber);
    expect(text).toContain("Товар_калибр");
    expect(text).toContain("25000");
  });

  test("отчёты: legacy /reports → /o/reports", async ({ page }) => {
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/o\/reports$/);
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });

  test("отчёты: ?trip= подставляет рейс и загружает отчёт", async ({ page, request }) => {
    const id = `e2e-url-trip-${Date.now()}`;
    const tripNumber = "E2E-URL";
    const res = await request.post("/api/trips", {
      data: { id, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto(`/o/reports?trip=${encodeURIComponent(id)}`);
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
    await expect(birzhaSelectTrigger(page, "#trip-select")).toContainText(tripNumber, { timeout: 15_000 });
    await expect(page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("отчёты: удаление пустого рейса", async ({ page, request }) => {
    const id = `e2e-del-trip-${Date.now()}`;
    const tripNumber = "E2E-DEL";
    const res = await request.post("/api/trips", {
      data: { id, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
    await pickBirzhaSelectByLabel(page, "#trip-select", labelPattern(tripNumber));
    await expect(page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Удалить пустой рейс" })).toBeVisible({ timeout: 15_000 });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Удалить пустой рейс" }).click();
    await expect(birzhaSelectTrigger(page, "#trip-select")).toContainText("—", { timeout: 15_000 });
    await expect(birzhaSelectTrigger(page, "#trip-select")).not.toContainText(tripNumber);
  });

  test("погрузка: раздел и legacy /distribution → /o/distribution", async ({ page }) => {
    await page.goto("/o/distribution");
    await expect(page.getByRole("region", { name: "Погрузка на машину" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Погрузка на машину" })).toBeVisible();

    await page.goto("/distribution");
    await expect(page).toHaveURL(/\/o\/distribution$/);
    await expect(page.getByRole("region", { name: "Погрузка на машину" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/o/loading-manifests");
    await expect(page).toHaveURL(/\/o\/distribution$/);
  });

  test("догрузка и смена рейса: отдельные разделы /o", async ({ page }) => {
    await page.goto("/o/loading-append");
    await expect(page).toHaveURL(/\/o\/loading-append$/);
    await expect(page.getByRole("region", { name: "Догрузка" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Догрузка" })).toBeVisible();

    await page.goto("/o/loading-trip");
    await expect(page).toHaveURL(/\/o\/loading-trip$/);
    await expect(page.getByRole("region", { name: "Смена рейса" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Смена рейса" })).toBeVisible();
  });

  test("операции: панель и таблица партий (GET /api/batches)", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-ops-b-${suffix}`;
    const res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `p-e2e-ops-${suffix}`,
        totalKg: 10,
        pricePerKg: 5,
        distribution: "awaiting_receipt",
      },
    });
    expect(res.ok()).toBeTruthy();

    const listRes = await request.get("/api/batches");
    expect(listRes.ok()).toBeTruthy();
    const listBody = (await listRes.json()) as { batches: { id: string }[] };
    expect(listBody.batches.some((b) => b.id === batchId)).toBeTruthy();

    await page.goto("/operations");
    await expect(page).toHaveURL(/\/o\/operations$/, { timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Недостача по рейсу и справочно партии" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Недостача по рейсу" })).toBeVisible();
    await expect(page.getByLabel("Партия *")).toBeVisible();
    await expect(page.getByLabel("Рейс *")).toBeVisible();
    await expect(page.getByLabel("kg *")).toBeVisible();
    await expect(page.getByLabel("Причина *")).toBeVisible();
    await expect(page.getByRole("button", { name: "Зафиксировать недостачу" })).toBeVisible();
    const batchesBlock = page.getByText("Партии по закупочным накладным", { exact: true });
    await expect(batchesBlock).toBeVisible();
    await batchesBlock.click();
    /** Блок только для партий с накладной; сырой POST /batches — пустое состояние. */
    await expect(page.getByRole("heading", { name: "Нет партий по накладным" })).toBeVisible({ timeout: 15_000 });
  });

  test("операции: запись недостачи через UI после отгрузки накладной", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const docId = `e2e-short-nakl-${suffix}`;
    const tripId = `e2e-short-trip-${suffix}`;
    const tripNumber = `SHOP-${suffix.slice(-8)}`;
    const reason = "E2E недостача при приёмке";

    let res = await request.post("/api/purchase-documents", {
      data: {
        id: docId,
        documentNumber: `НФ-SH-${suffix.slice(-8)}`,
        docDate: "2026-06-07",
        warehouseId: "wh-manas",
        supplierName: `E2E-${suffix.slice(-6)}`,
        extraCostKopecks: 0,
        lines: [
          {
            productGradeId: "pg-n5",
            grossKg: 22,
            packageCount: 4,
            pricePerKg: 35,
            lineTotalKopecks: 70_000,
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();

    const docRes = await request.get(`/api/purchase-documents/${docId}`);
    expect(docRes.ok()).toBeTruthy();
    const doc = (await docRes.json()) as { lines: { batchId: string }[] };
    const batchId = doc.lines[0]!.batchId;

    res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 15, tripId },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/operations");
    await expect(page.getByRole("region", { name: "Недостача по рейсу и справочно партии" })).toBeVisible({
      timeout: 15_000,
    });

    await pickBirzhaSelectFirstRealOption(page, "#op-in-short-batch");
    await pickBirzhaSelectByLabel(page, "#op-sel-short-trip", labelPattern(tripNumber));
    await page.fill("#op-in-short-kg", "2");
    await page.fill("#op-in-short-reason", reason);
    await page.getByRole("button", { name: "Зафиксировать недостачу" }).click();
    await expect(page.getByText("Готово.", { exact: true })).toBeVisible({ timeout: 15_000 });

    const reportRes = await request.get(`/api/trips/${tripId}/shipment-report`);
    expect(reportRes.ok()).toBeTruthy();
    const report = (await reportRes.json()) as { shortage: { totalGrams: string } };
    expect(report.shortage.totalGrams).toBe("2000");
  });

  test("закупка: форма и legacy /purchase-nakladnaya → /o/purchase-nakladnaya", async ({ page }) => {
    await page.goto("/o/purchase-nakladnaya");
    await expect(page.getByRole("region", { name: "Закупка товара" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Закупка товара" })).toBeVisible();

    await expect(page.getByLabel("Тепличник *")).toBeVisible();
    await expect(page.getByLabel("Новый тепличник")).toBeVisible();
    await expect(page.getByLabel("Дата *")).toBeVisible();
    await expect(page.getByRole("button", { name: "Создать накладную" })).toBeVisible();

    const firstLine = page.locator(".birzha-nakl-lines-table tbody tr").first();
    await firstLine.getByLabel("Брутто, кг").fill("10");
    await firstLine.locator('[data-label="₽/кг"] input').fill("40");
    await expect(firstLine.locator('[data-label="Сумма, коп."] input')).toHaveValue("400,00");
    await expect(page.getByRole("button", { name: "=кг×цена" })).toHaveCount(0);

    await page.goto("/purchase-nakladnaya");
    await expect(page).toHaveURL(/\/o\/purchase-nakladnaya$/);
    await expect(page.getByRole("region", { name: "Закупка товара" })).toBeVisible({ timeout: 15_000 });
  });

  test("закупка: созданный документ в списке «В работе» и карточка", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const docId = `e2e-nakl-${suffix}`;
    const docNumber = `НФ-E2E-${suffix.slice(-8)}`;
    const supplierName = `E2E-Теплица-${suffix.slice(-6)}`;

    const res = await request.post("/api/purchase-documents", {
      data: {
        id: docId,
        documentNumber: docNumber,
        docDate: "2026-06-07",
        warehouseId: "wh-manas",
        supplierName,
        extraCostKopecks: 0,
        lines: [
          {
            productGradeId: "pg-n5",
            grossKg: 13.5,
            packageCount: 3,
            pricePerKg: 40,
            lineTotalKopecks: 48_000,
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/purchase-nakladnaya");
    await expect(page.getByRole("region", { name: "Закупка товара" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "В работе" })).toBeVisible({ timeout: 15_000 });
    const docLink = page.getByRole("link", { name: docNumber });
    await expect(docLink).toBeVisible({ timeout: 15_000 });
    await docLink.click();
    await expect(page).toHaveURL(new RegExp(`/o/purchase-nakladnaya/${encodeURIComponent(docId)}$`));
    await expect(page.getByRole("heading", { name: /Накладная/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(supplierName)).toBeVisible();
    await expect(page.getByText("№5")).toBeVisible();
  });

  test("рейсы: раздел /o/trips и рейс в списке после POST", async ({ page, request }) => {
    const id = `e2e-trips-ui-${Date.now()}`;
    const tripNumber = "E2E-TRIPS-LIST";
    const res = await request.post("/api/trips", {
      data: { id, tripNumber, driverName: "Иванов", vehicleLabel: "А111АА 77" },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/trips");
    await expect(page.getByRole("region", { name: "Рейсы" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Рейсы", exact: true })).toBeVisible();
    await expect(page.getByText("Иванов")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("А111АА 77")).toBeVisible();
  });

  test("погрузка: остаток после закупки → отбор (in-memory, просмотр)", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const docId = `e2e-dist-nakl-${suffix}`;

    const res = await request.post("/api/purchase-documents", {
      data: {
        id: docId,
        documentNumber: `НФ-DIST-${suffix.slice(-8)}`,
        docDate: "2026-06-07",
        warehouseId: "wh-manas",
        supplierName: `E2E-Поставщик-${suffix.slice(-6)}`,
        extraCostKopecks: 0,
        lines: [
          {
            productGradeId: "pg-n5",
            grossKg: 22,
            packageCount: 4,
            pricePerKg: 35,
            lineTotalKopecks: 70_000,
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/distribution");
    await expect(page.getByRole("region", { name: "Погрузка на машину" })).toBeVisible({ timeout: 15_000 });

    await pickBirzhaSelectByLabel(page, "#alloc-sel-warehouse", /Манас/);
    await expect(page.getByText("1. Возврат на склад и отбор партий")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("В отборе:", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`a[href="/o/purchase-nakladnaya/${docId}"]`)).toBeVisible({
      timeout: 15_000,
    });

    await expect(
      page.getByText("Сохранение погрузочной накладной и привязка к рейсу — у кладовщика или логиста"),
    ).toBeVisible();
  });

  test("продавец и продажи: раздел /o/assign-seller и редирект seller-dispatch", async ({ page }) => {
    await page.goto("/o/assign-seller");
    await expect(page.getByRole("region", { name: "Продавец и продажи" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Продажи по продавцу" })).toBeVisible();

    await page.goto("/o/seller-dispatch");
    await expect(page).toHaveURL(/\/o\/assign-seller$/);
  });

  test("продавец: /s — кабинет и форма продажи", async ({ page }) => {
    await page.goto("/s");
    await expect(page.getByRole("heading", { name: "Кабинет продавца" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Продажа с рейса" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Тип сделки" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Розница или опт" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Розница" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Рейс" })).toBeVisible();
    await expect(birzhaSelectTrigger(page, "#seller-sell-sel-trip")).toBeVisible();
  });

  test("продавец: после отгрузки в рейс — калибры на /s", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-sell-b-${suffix}`;
    const tripId = `e2e-sell-t-${suffix}`;
    const tripNumber = `SELL-${suffix.slice(-8)}`;

    let res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `p-e2e-sell-${suffix}`,
        totalKg: 30,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 12, tripId },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto(`/s?trip=${encodeURIComponent(tripId)}`);
    await expect(page.getByRole("heading", { name: "Продажа с рейса" })).toBeVisible({ timeout: 15_000 });
    await expect(birzhaSelectTrigger(page, "#seller-sell-sel-trip")).toContainText(tripNumber, {
      timeout: 15_000,
    });
    await expect(page.getByRole("listbox", { name: "Калибры на рейсе (остаток в машине)" })).toBeVisible({
      timeout: 15_000,
    });
    const caliberOption = page.getByRole("option", { name: /12 кг/ });
    await expect(caliberOption).toBeVisible();
    await caliberOption.click();
    await expect(page.getByRole("region", { name: "Количество и цена" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Сколько килограмм в этой сделке *")).toBeVisible();
    await expect(page.getByLabel("Цена за 1 кг нетто, руб *")).toBeVisible();
  });

  test("продавец: /s/reports — отчёт по рейсу", async ({ page }) => {
    await page.goto("/s/reports");
    await expect(page.getByRole("heading", { name: "Отчёт по рейсу" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#trip-select")).toBeVisible({ timeout: 15_000 });
  });

  test("продавец: /s/operations — недостача (без входа: seller+склад)", async ({ page }) => {
    await page.goto("/s/operations");
    await expect(page.getByRole("region", { name: "Недостача по рейсу и справочно партии" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Недостача по рейсу" })).toBeVisible();
  });

  test("архив: /o/archive — закрытый рейс в таблице", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const tripId = `e2e-arch-t-${suffix}`;
    const tripNumber = `ARCH-${suffix.slice(-8)}`;

    let res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber, driverName: "Петров", vehicleLabel: "В222ВВ 77" },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/trips/${tripId}/close`, { data: {} });
    expect(res.ok()).toBeTruthy();

    await page.goto("/o/archive");
    await expect(page.getByRole("heading", { name: "Архив" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("table", { name: "Архив рейсов" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Закупочные накладные")).toBeVisible();
    await expect(page.getByText("Погрузочные накладные")).toBeVisible();
    await expect(page.getByRole("link", { name: tripNumber })).toBeVisible();
    await expect(page.getByText("Петров")).toBeVisible();
  });

  test("архив: ?trip= — продажи закрытого рейса", async ({ page, request }) => {
    const suffix = `${Date.now()}`;
    const batchId = `e2e-arch-b-${suffix}`;
    const tripId = `e2e-arch-rpt-${suffix}`;
    const tripNumber = `ARPT-${suffix.slice(-8)}`;
    const clientLabel = `E2E-Архив-${suffix.slice(-6)}`;

    let res = await request.post("/api/batches", {
      data: {
        id: batchId,
        purchaseId: `p-e2e-arch-${suffix}`,
        totalKg: 40,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post("/api/trips", {
      data: { id: tripId, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/ship-to-trip`, {
      data: { kg: 10, tripId },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/batches/${batchId}/sell-from-trip`, {
      data: {
        tripId,
        kg: 3,
        saleId: `e2e-arch-sale-${suffix}`,
        pricePerKg: 50,
        paymentKind: "cash",
        clientLabel,
      },
    });
    expect(res.ok()).toBeTruthy();

    res = await request.post(`/api/trips/${tripId}/close`, { data: {} });
    expect(res.ok()).toBeTruthy();

    await page.goto(`/o/archive?trip=${encodeURIComponent(tripId)}`);
    await expect(page.getByRole("heading", { name: "Архив" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Продажи по рейсу/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Продажи по рейсу/ })).toContainText(tripNumber);
    await expect(page.getByRole("link", { name: "Полный отчёт (партии, отгрузка, недостача)" })).toBeVisible();
    const journal = page.getByRole("table", { name: "Журнал сделок по рейсу" });
    await expect(journal).toBeVisible({ timeout: 15_000 });
    await expect(journal.getByRole("cell", { name: clientLabel, exact: true })).toBeVisible();
  });

  test("архив: /s/archive — только рейсы (без накладных)", async ({ page }) => {
    await page.goto("/s/archive");
    await expect(page.getByRole("heading", { name: "Архив" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("table", { name: "Архив рейсов" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Закупочные накладные")).toHaveCount(0);
    await expect(page.getByText("Погрузочные накладные")).toHaveCount(0);
  });

  test("админ: /a — меню кабинета", async ({ page }) => {
    await page.goto("/a");
    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav).toBeVisible({ timeout: 15_000 });
    await expect(nav.getByRole("link", { name: "Сводка" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Догрузка" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Смена рейса" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Отчёты и рейсы" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Продавец и продажи" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Архив" })).toBeVisible();
  });

  test("админ: /a/reports — отчёты (тот же блок, что /o/reports)", async ({ page, request }) => {
    const id = `e2e-a-rep-${Date.now()}`;
    const tripNumber = `A-REP-${Date.now().toString().slice(-6)}`;
    const res = await request.post("/api/trips", {
      data: { id, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/a/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
    await expect(birzhaSelectTrigger(page, "#trip-select")).toBeVisible({ timeout: 15_000 });
    await expectBirzhaSelectHasOption(page, "#trip-select", labelPattern(tripNumber));
  });

  test("админ: без PostgreSQL — dashboard-summary недоступен", async ({ page, request }) => {
    const res = await request.get("/api/admin/dashboard-summary");
    expect(res.status()).toBe(404);

    await page.goto("/a");
    await expect(page.getByText("Не удалось загрузить сводку")).toBeVisible({ timeout: 15_000 });
  });

  test("админ: legacy /a/trip-registry → /a/trips", async ({ page }) => {
    await page.goto("/a/trip-registry");
    await expect(page).toHaveURL(/\/a\/trips$/);
    await expect(page.getByRole("heading", { name: "Рейсы", exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("админ: /a/settings/catalog и legacy /a/inventory", async ({ page }) => {
    await page.goto("/a/settings/catalog");
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("navigation", { name: "Разделы настроек" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Справочники" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Разделы справочников" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Склады" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Калибры" })).toBeVisible();

    await page.goto("/a/inventory");
    await expect(page).toHaveURL(/\/a\/settings\/catalog(\?section=warehouses)?$/);
  });

  test("админ: /a/settings/documents — правка шапок накладных", async ({ page }) => {
    await page.goto("/a/settings/documents");
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Накладные" })).toBeVisible();
    await expect(page.getByText("Закупочные накладные")).toBeVisible({ timeout: 15_000 });
  });

  test("админ: /a/settings/team и legacy /a/users", async ({ page, request }) => {
    const metaRes = await request.get("/api/meta");
    expect(metaRes.ok()).toBeTruthy();
    const meta = (await metaRes.json()) as { adminUsersApi?: string };
    expect(meta.adminUsersApi).toBe("disabled");

    await page.goto("/a/settings/team");
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Управление сотрудниками недоступно")).toBeVisible({ timeout: 15_000 });

    await page.goto("/a/users");
    await expect(page).toHaveURL(/\/a\/settings\/team$/);
  });

  test("админ: /a/stock-warehouses — склады и остатки", async ({ page }) => {
    await page.goto("/a/stock-warehouses");
    await expect(page.getByRole("region", { name: "Склады и остатки" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Склады и остатки" })).toBeVisible();
    await expect(page.getByLabel("Название нового склада")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Добавить склад" })).toBeVisible();
    await expect(page.getByText("Закупочные накладные на складе")).toBeVisible({ timeout: 15_000 });
  });

  test("админ: /a/warehouse-returns — без PostgreSQL журнал недоступен", async ({ page, request }) => {
    const metaRes = await request.get("/api/meta");
    expect(metaRes.ok()).toBeTruthy();
    const meta = (await metaRes.json()) as { warehouseWriteOffApi?: string };
    expect(meta.warehouseWriteOffApi).toBe("disabled");

    await page.goto("/a/warehouse-returns");
    await expect(page.getByRole("heading", { name: "Журнал недоступен" })).toBeVisible({ timeout: 15_000 });
  });

  test("бухгалтерия: /b — сводка и меню", async ({ page }) => {
    await page.goto("/b");
    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav).toBeVisible({ timeout: 15_000 });
    await expect(nav.getByRole("link", { name: "Сводка" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Отчёт по рейсу" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Контрагенты" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Сверка по рейсам" })).toBeVisible();
  });

  test("бухгалтерия: /b без PostgreSQL — только деньги по рейсам", async ({ page, request }) => {
    const res = await request.get("/api/stock-balances");
    expect(res.status()).toBe(404);

    await page.goto("/b");
    await expect(page.getByRole("heading", { name: "Сверка по рейсам" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Остатки не загрузились")).toHaveCount(0);
    await expect(page.getByText("Выручка, себестоимость и валовая прибыль")).toBeVisible();
  });

  test("бухгалтерия: /b/reports — отчёт (сверка)", async ({ page, request }) => {
    const id = `e2e-b-rep-${Date.now()}`;
    const tripNumber = `B-REP-${Date.now().toString().slice(-6)}`;
    const res = await request.post("/api/trips", {
      data: { id, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/b/reports");
    await expect(page.getByRole("heading", { name: "Отчёт по рейсу (сверка)" })).toBeVisible({ timeout: 15_000 });
    await expect(birzhaSelectTrigger(page, "#trip-select")).toBeVisible({ timeout: 15_000 });
    await expectBirzhaSelectHasOption(page, "#trip-select", labelPattern(tripNumber));
  });

  test("бухгалтерия: /b/counterparties — справочник (in-memory)", async ({ page, request }) => {
    const metaRes = await request.get("/api/meta");
    expect(metaRes.ok()).toBeTruthy();
    const meta = (await metaRes.json()) as { counterpartyCatalogApi?: string };
    expect(meta.counterpartyCatalogApi).toBe("enabled");

    await page.goto("/b/counterparties");
    await expect(page.getByRole("region", { name: "Справочник контрагентов" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Контрагенты" })).toBeVisible();
    await expect(page.getByText("Список контрагентов")).toBeVisible({ timeout: 15_000 });
  });

  test("бухгалтерия: legacy /b/seller-dispatch и /b/trade → /b", async ({ page }) => {
    await page.goto("/b/seller-dispatch");
    await expect(page).toHaveURL(/\/b\/?$/);
    await page.goto("/b/trade");
    await expect(page).toHaveURL(/\/b\/?$/);
  });

  test("навигация: боковое меню /o (закупка → рейсы → погрузка → догрузка → смена рейса)", async ({ page }) => {
    await page.goto("/o/reports");
    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav).toBeVisible();

    await nav.getByRole("link", { name: "Закупка товара" }).click();
    await expect(page).toHaveURL(/\/o\/purchase-nakladnaya$/);
    await expect(page.getByRole("region", { name: "Закупка товара" })).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Рейсы", exact: true }).click();
    await expect(page).toHaveURL(/\/o\/trips$/);
    await expect(page.getByRole("heading", { name: "Рейсы" })).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Погрузка на машину" }).click();
    await expect(page).toHaveURL(/\/o\/distribution$/);
    await expect(page.getByRole("region", { name: "Погрузка на машину" })).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Догрузка" }).click();
    await expect(page).toHaveURL(/\/o\/loading-append$/);
    await expect(page.getByRole("region", { name: "Догрузка" })).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Смена рейса" }).click();
    await expect(page).toHaveURL(/\/o\/loading-trip$/);
    await expect(page.getByRole("region", { name: "Смена рейса" })).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Недостача по рейсу" }).click();
    await expect(page).toHaveURL(/\/o\/operations$/);
    await expect(page.getByRole("heading", { name: "Недостача по рейсу" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/o/reports");
    await expect(page).toHaveURL(/\/o\/reports$/);
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });
});
