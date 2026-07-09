import { expect, test } from "@playwright/test";

/** Совпадает с дефолтом в `apps/api/src/e2e-seed-role-users.ts`. */
const E2E_DEFAULT_TEST_PASSWORD = "E2e-birzha-test-99";

/**
 * Только при **`E2E_DATABASE_URL`** + JWT: сервер `e2e-server.ts` поднимает Postgres,
 * `REQUIRE_API_AUTH`, сид пользователей всех 8 ролей MVP.
 * В обычном CI без БД весь describe пропускается.
 */
const authPg = !!process.env.E2E_DATABASE_URL;
const describeAuth = authPg ? test.describe : test.describe.skip;

describeAuth("роли: навигация при REQUIRE_API_AUTH (PostgreSQL)", () => {
  test.describe.configure({ mode: "serial" });

  const password = process.env.E2E_TEST_PASSWORD ?? E2E_DEFAULT_TEST_PASSWORD;
  const roleCases = [
    { login: "e2e_admin", home: /\/a\/?$/, disallowCabinets: [] as string[] },
    { login: "e2e_accountant", home: /\/b\/?$/, disallowCabinets: ["/a/reports", "/o/reports", "/s/reports"] },
    { login: "e2e_manager", home: /\/o\/(purchase-nakladnaya|reports)$/, disallowCabinets: ["/a/reports", "/b/reports", "/s/reports"] },
    { login: "e2e_purchaser", home: /\/o\/purchase-nakladnaya$/, disallowCabinets: ["/a/reports", "/b/reports"] },
    { login: "e2e_warehouse", home: /\/o\/purchase-nakladnaya$/, disallowCabinets: ["/a/reports", "/b/reports"] },
    { login: "e2e_logistics", home: /\/o\/reports$/, disallowCabinets: ["/a/reports", "/b/reports"] },
    { login: "e2e_receiver", home: /\/o\/reports$/, disallowCabinets: ["/a/reports", "/b/reports"] },
    { login: "e2e_seller", home: /\/s\/?$/, disallowCabinets: ["/a/reports", "/o/reports", "/b/reports"] },
  ];

  async function uiLogin(page: import("@playwright/test").Page, login: string): Promise<void> {
    await page.context().clearCookies();
    await page.addInitScript(() => {
      sessionStorage.clear();
      localStorage.removeItem("birzha_api_token");
    });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible({ timeout: 30_000 });
    await page.locator("#login-user").fill(login);
    await page.locator("#login-pass").fill(password);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("heading", { name: "Вход" })).not.toBeVisible({ timeout: 20_000 });
  }

  async function apiLogin(request: import("@playwright/test").APIRequestContext, login: string): Promise<string> {
    const res = await request.post("/auth/login", { data: { login, password } });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { token: string };
    return body.token;
  }

  test("все 8 ролей: вход и редирект в домашний кабинет", async ({ page }) => {
    for (const roleCase of roleCases) {
      await uiLogin(page, roleCase.login);
      await expect(page).toHaveURL(roleCase.home, { timeout: 20_000 });
    }
  });

  test("все 8 ролей: прямой переход в чужие кабинеты редиректит обратно", async ({ page }) => {
    for (const roleCase of roleCases) {
      await uiLogin(page, roleCase.login);
      await expect(page).toHaveURL(roleCase.home, { timeout: 20_000 });
      for (const path of roleCase.disallowCabinets) {
        await page.goto(path);
        await expect(page).toHaveURL(roleCase.home, { timeout: 20_000 });
      }
    }
  });

  test("роли: видимость ключевых пунктов меню", async ({ page }) => {
    await uiLogin(page, "e2e_admin");
    let nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Сводка" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Настройки" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Продавец и продажи" })).toBeVisible();

    await uiLogin(page, "e2e_accountant");
    nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Сводка" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Контрагенты" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Закупка товара" })).toHaveCount(0);

    await uiLogin(page, "e2e_warehouse");
    nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Догрузка" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Смена рейса" })).toBeVisible();

    await uiLogin(page, "e2e_seller");
    nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Продажа" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Отчёт по рейсу" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Архив" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Закупка товара" })).toHaveCount(0);
  });

  test("API auth matrix: запрещённые роли получают 403, разрешённые — успех", async ({ request }) => {
    const adminToken = await apiLogin(request, "e2e_admin");
    const managerToken = await apiLogin(request, "e2e_manager");
    const logisticsToken = await apiLogin(request, "e2e_logistics");
    const purchaserToken = await apiLogin(request, "e2e_purchaser");
    const sellerToken = await apiLogin(request, "e2e_seller");
    const accountantToken = await apiLogin(request, "e2e_accountant");
    const receiverToken = await apiLogin(request, "e2e_receiver");

    const tripPayload = {
      id: `e2e-role-trip-${Date.now()}`,
      tripNumber: `ROLE-${Date.now().toString().slice(-6)}`
    };

    const sellerTripCreate = await request.post("/trips", {
      headers: { authorization: `Bearer ${sellerToken}` },
      data: tripPayload
    });
    expect(sellerTripCreate.status()).toBe(403);

    const purchaserTripCreate = await request.post("/trips", {
      headers: { authorization: `Bearer ${purchaserToken}` },
      data: { ...tripPayload, id: `${tripPayload.id}-p`, tripNumber: `${tripPayload.tripNumber}-P` }
    });
    expect(purchaserTripCreate.status()).toBe(403);

    const receiverTripCreate = await request.post("/trips", {
      headers: { authorization: `Bearer ${receiverToken}` },
      data: { ...tripPayload, id: `${tripPayload.id}-r`, tripNumber: `${tripPayload.tripNumber}-R` }
    });
    expect(receiverTripCreate.status()).toBe(403);

    const managerTripCreate = await request.post("/trips", {
      headers: { authorization: `Bearer ${managerToken}` },
      data: { ...tripPayload, id: `${tripPayload.id}-m`, tripNumber: `${tripPayload.tripNumber}-M` }
    });
    expect(managerTripCreate.status()).toBe(201);

    const logisticsTripCreate = await request.post("/trips", {
      headers: { authorization: `Bearer ${logisticsToken}` },
      data: { ...tripPayload, id: `${tripPayload.id}-l`, tripNumber: `${tripPayload.tripNumber}-L` }
    });
    expect(logisticsTripCreate.status()).toBe(201);

    const warehouseCreateByAccountant = await request.post("/warehouses", {
      headers: { authorization: `Bearer ${accountantToken}`, "content-type": "application/json" },
      data: { name: "Forbidden warehouse", code: `F${Date.now().toString().slice(-4)}` }
    });
    expect(warehouseCreateByAccountant.status()).toBe(403);

    const warehouseCreateByAdmin = await request.post("/warehouses", {
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      data: { name: "E2E warehouse", code: `A${Date.now().toString().slice(-4)}` }
    });
    expect(warehouseCreateByAdmin.status()).toBe(201);
  });
});
