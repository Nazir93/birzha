import { expect, test } from "@playwright/test";

/** Совпадает с дефолтом в `apps/api/src/e2e-seed-role-users.ts`. */
const E2E_DEFAULT_TEST_PASSWORD = "E2e-birzha-test-99";

/**
 * Только при **`E2E_DATABASE_URL`** + JWT: сервер `e2e-server.ts` поднимает Postgres,
 * `REQUIRE_API_AUTH`, сид `e2e_accountant` / `e2e_warehouse`.
 * В обычном CI без БД весь describe пропускается.
 */
const authPg = !!process.env.E2E_DATABASE_URL;
const describeAuth = authPg ? test.describe : test.describe.skip;

describeAuth("роли: навигация при REQUIRE_API_AUTH (PostgreSQL)", () => {
  test.describe.configure({ mode: "serial" });

  const password = process.env.E2E_TEST_PASSWORD ?? E2E_DEFAULT_TEST_PASSWORD;

  test("бухгалтер: только «Отчёты и рейсы» из основных разделов", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible({ timeout: 30_000 });
    await page.locator("#login-user").fill("e2e_accountant");
    await page.locator("#login-pass").fill(password);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/\/reports$/, { timeout: 20_000 });

    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Отчёты и рейсы" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Накладная" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Операции" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Офлайн-очередь" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Служебное" })).toHaveCount(0);
  });

  test("кладовщик: отчёты, операции, офлайн; без «Служебное»", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page.getByRole("link", { name: "Вход" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/login");
    await page.locator("#login-user").fill("e2e_warehouse");
    await page.locator("#login-pass").fill(password);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/\/purchase-nakladnaya$/, { timeout: 20_000 });

    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Накладная" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Отчёты и рейсы" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Операции" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Офлайн-очередь" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Служебное" })).toHaveCount(0);
  });
});
