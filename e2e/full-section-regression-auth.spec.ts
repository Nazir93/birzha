import { expect, test } from "@playwright/test";

const E2E_DEFAULT_TEST_PASSWORD = "E2e-birzha-test-99";
const authPg = !!process.env.E2E_DATABASE_URL;
const describeAuth = authPg ? test.describe : test.describe.skip;

describeAuth("полный регресс разделов (REQUIRE_API_AUTH + PostgreSQL)", () => {
  test.describe.configure({ mode: "serial" });
  const password = process.env.E2E_TEST_PASSWORD ?? E2E_DEFAULT_TEST_PASSWORD;

  async function login(page: import("@playwright/test").Page, user: string): Promise<void> {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator("#login-user").fill(user);
    await page.locator("#login-pass").fill(password);
    await page.getByRole("button", { name: "Войти" }).click();
  }

  test("админ: все разделы /a доступны и содержат ключевые кнопки", async ({ page }) => {
    await login(page, "e2e_admin");
    await expect(page).toHaveURL(/\/a\/?$/, { timeout: 20_000 });

    await page.goto("/a/reports");
    await expect(page.getByRole("heading", { name: "Рейсы и отчёт по фуре" })).toBeVisible();

    await page.goto("/a/purchase-nakladnaya");
    await expect(page.getByRole("button", { name: "Создать накладную" })).toBeVisible();

    await page.goto("/a/distribution");
    await expect(page.getByRole("region", { name: "Погрузка на машину" })).toBeVisible();
    await expect(page.getByLabel("Склад *")).toBeVisible();

    await page.goto("/a/trips");
    await expect(page.getByRole("heading", { name: "Рейсы", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Создать рейс" })).toBeVisible();

    await page.goto("/a/assign-seller");
    await expect(page.getByRole("heading", { name: "Продажи по продавцу" })).toBeVisible();

    await page.goto("/a/operations");
    await expect(page.getByRole("button", { name: "Зафиксировать недостачу" })).toBeVisible();

    await page.goto("/a/archive");
    await expect(page.getByRole("heading", { name: "Архив" })).toBeVisible();

    await page.goto("/a/settings/catalog");
    await expect(page.getByRole("button", { name: "Склады" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Калибры" })).toBeVisible();

    await page.goto("/a/settings/documents");
    await expect(page.getByText("Закупочные накладные")).toBeVisible();

    await page.goto("/a/settings/team");
    await expect(page.getByRole("heading", { name: "Сотрудники" })).toBeVisible();
  });

  test("закупщик: /o содержит рабочие разделы и без админ-настроек", async ({ page }) => {
    await login(page, "e2e_purchaser");
    await expect(page).toHaveURL(/\/o\/purchase-nakladnaya$/, { timeout: 20_000 });
    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Закупка товара" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Погрузка на машину" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Рейсы" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Продавец и продажи" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Настройки" })).toHaveCount(0);
    await page.goto("/a/settings/catalog");
    await expect(page).toHaveURL(/\/o\/purchase-nakladnaya$/, { timeout: 20_000 });
  });

  test("логист: доступен полный операционный цикл /o", async ({ page }) => {
    await login(page, "e2e_logistics");
    await expect(page).toHaveURL(/\/o\/reports$/, { timeout: 20_000 });

    await page.goto("/o/trips");
    await expect(page.getByRole("button", { name: "Создать рейс" })).toBeVisible();

    await page.goto("/o/distribution");
    await expect(page.getByRole("region", { name: "Погрузка на машину" })).toBeVisible();

    await page.goto("/o/assign-seller");
    await expect(page.getByRole("heading", { name: "Продажи по продавцу" })).toBeVisible();

    await page.goto("/o/operations");
    await expect(page.getByRole("button", { name: "Зафиксировать недостачу" })).toBeVisible();
  });

  test("продавец: /s только seller-разделы", async ({ page }) => {
    await login(page, "e2e_seller");
    await expect(page).toHaveURL(/\/s\/?$/, { timeout: 20_000 });
    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Продажа" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Отчёт по рейсу" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Архив" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Закупка товара" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Контрагенты" })).toHaveCount(0);
  });

  test("бухгалтер: /b сводка, отчёт, контрагенты", async ({ page }) => {
    await login(page, "e2e_accountant");
    await expect(page).toHaveURL(/\/b\/?$/, { timeout: 20_000 });
    const nav = page.getByRole("navigation", { name: "Разделы приложения" });
    await expect(nav.getByRole("link", { name: "Сводка" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Отчёт по рейсу" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Контрагенты" })).toBeVisible();

    await page.goto("/b/reports");
    await expect(page.getByRole("heading", { name: "Отчёт по рейсу (сверка)" })).toBeVisible();

    await page.goto("/b/counterparties");
    await expect(page.getByRole("button", { name: "Добавить контрагента" })).toBeVisible();
  });
});
