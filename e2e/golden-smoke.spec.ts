import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

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

  test("корень / → редирект на /reports", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole("heading", { name: "Биржа" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });

  test("неизвестный путь → редирект на /reports (catch-all)", async ({ page }) => {
    await page.goto("/_e2e-no-such-route");
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });

  test("/login при выключенной обязательной авторизации → редирект на /reports", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });

  test("главная и служебная страница: meta с включённым batches API", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Биржа" })).toBeVisible();

    await page.goto("/service");
    await expect(page.getByRole("heading", { name: "Диагностика сервера" })).toBeVisible();
    const pre = page.getByLabel("JSON ответа GET /api/meta");
    await expect(pre).toContainText('"batchesApi": "enabled"', { timeout: 30_000 });
    await expect(pre).toContainText('"syncApi": "enabled"');
  });

  test("отчёты: после POST /trips в селекторе появляется рейс", async ({ page, request }) => {
    const id = `e2e-smoke-trip-${Date.now()}`;
    const tripNumber = "E2E-SMOKE";
    const res = await request.post("/api/trips", {
      data: { id, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });

    const select = page.locator("#trip-select");
    await expect(select).toBeVisible({ timeout: 15_000 });
    // <option> в закрытом <select> не «visible» для Playwright — проверяем состав списка по тексту
    await expect(select).toContainText(tripNumber);
  });

  test("отчёты: выбор рейса загружает блок отчёта (shipment-report)", async ({ page, request }) => {
    const id = `e2e-report-trip-${Date.now()}`;
    const tripNumber = "E2E-REPORT";
    const res = await request.post("/api/trips", {
      data: { id, tripNumber },
    });
    expect(res.ok()).toBeTruthy();

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });

    await page.selectOption("#trip-select", id);
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

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });
    await page.selectOption("#trip-select", tripId);
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

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });
    await page.selectOption("#trip-select", tripId);
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
      sales: { totalCashKopecks: string; totalDebtKopecks: string };
    };
    expect(report.sales.totalCashKopecks).toBe("0");
    const cashLabel = kopecksToRubLabel("0");
    const debtLabel = kopecksToRubLabel(report.sales.totalDebtKopecks);

    await page.goto("/reports");
    await page.selectOption("#trip-select", tripId);
    const region = page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` });
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(region).toContainText(`${cashLabel} ₽ / ${debtLabel} ₽`);
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
      sales: { totalCashKopecks: string; totalDebtKopecks: string };
    };
    expect(report.sales.totalCashKopecks).toBe("5000");
    expect(report.sales.totalDebtKopecks).toBe("5000");

    const cashLabel = kopecksToRubLabel(report.sales.totalCashKopecks);
    const debtLabel = kopecksToRubLabel(report.sales.totalDebtKopecks);

    await page.goto("/reports");
    await page.selectOption("#trip-select", tripId);
    const region = page.getByRole("region", { name: `Отчёт по рейсу ${tripNumber}` });
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(region).toContainText(`${cashLabel} ₽ / ${debtLabel} ₽`);
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
    expect(report.sales.totalDebtKopecks).toBe(expectedRevenue.toString());
    expect(report.sales.byClient).toHaveLength(1);
    expect(report.sales.byClient[0].clientLabel).toBe("ИП Иванов");
    expect(report.financials.revenueKopecks).toBe(expectedRevenue.toString());
    expect(report.financials.costOfSoldKopecks).toBe(expectedCostSold.toString());
    expect(report.financials.costOfShortageKopecks).toBe(expectedCostShortage.toString());
    expect(report.financials.grossProfitKopecks).toBe(expectedGross.toString());

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });
    await page.selectOption("#trip-select", tripId);
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

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 30_000 });
    await page.selectOption("#trip-select", tripId);
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
    expect(text).toContain("Партия_id");
    expect(text).toContain(batchId);
    expect(text).toContain("25000");
  });

  test("офлайн: очередь, create_trip и успешная синхронизация", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.locator("#offline-heading")).toContainText("Неотправленные действия");
    await expect(page.getByRole("button", { name: /Синхронизировать/ })).toBeVisible();
    const enqueueBtn = page.getByRole("button", { name: /добавить тестовое действие/i });
    await expect(enqueueBtn).toBeVisible();

    const count = page.locator("#offline-queue-count");
    await expect(count).not.toHaveText("…", { timeout: 15_000 });
    const before = Number.parseInt((await count.textContent()) ?? "0", 10);
    expect(Number.isFinite(before)).toBeTruthy();

    await enqueueBtn.click();
    await expect(count).toHaveText(String(before + 1), { timeout: 10_000 });

    await page.getByRole("button", { name: /Синхронизировать/ }).click();
    await expect(count).toHaveText(String(before), { timeout: 20_000 });
    await expect(page.getByLabel("Технический результат последней синхронизации, JSON")).toContainText(
      '"stoppedReason": "empty"',
      { timeout: 15_000 },
    );
    await expect(page.getByLabel("Технический результат последней синхронизации, JSON")).toContainText('"processed": 1');
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
    await expect(page.getByRole("region", { name: "Операции по партиям и рейсу" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Операции по партиям и рейсу" })).toBeVisible();
    await expect(page.locator("#op-batches-heading")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Партии по накладным", { exact: false })).toBeVisible();
    /** Блок «Партии по накладным» показывает только строки с документом закупки; сырой POST /batches без накладной — подсказка «нет привязанных». */
    await expect(
      page.getByText("Нет партий, привязанных к оформленной накладной", { exact: false }),
    ).toBeVisible();
  });

  test("навигация: вкладки AppNav (накладная → операции → офлайн → диагностика по URL → отчёты)", async ({ page }) => {
    await page.goto("/reports");
    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav).toBeVisible();

    await nav.getByRole("link", { name: "Накладная" }).click();
    await expect(page).toHaveURL(/\/purchase-nakladnaya$/);
    await expect(page.getByRole("region", { name: "Закупочная накладная" })).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Операции" }).click();
    await expect(page).toHaveURL(/\/operations$/);
    await expect(page.getByRole("heading", { name: "Операции по партиям и рейсу" })).toBeVisible({ timeout: 15_000 });

    await nav.getByRole("link", { name: "Офлайн-очередь" }).click();
    await expect(page).toHaveURL(/\/offline$/);
    await expect(page.locator("#offline-heading")).toBeVisible();

    /* Ссылка «Диагностика» в шапке только у admin/manager; анонимный e2e — прямой legacy URL. */
    await page.goto("/service");
    await expect(page).toHaveURL(/\/a\/service$/);
    await expect(page.getByRole("heading", { name: "Диагностика сервера" })).toBeVisible({ timeout: 30_000 });

    const adminNav = page.getByRole("navigation", { name: "Разделы приложения" });
    await adminNav.getByRole("link", { name: "Отчёты и рейсы" }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible({ timeout: 15_000 });
  });
});
