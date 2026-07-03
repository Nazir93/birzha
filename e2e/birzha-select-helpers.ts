import { expect, type Page, type Locator } from "@playwright/test";

export function labelPattern(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped);
}

async function listboxForTrigger(page: Page, triggerSelector: string): Promise<Locator> {
  const trigger = page.locator(triggerSelector);
  const id = await trigger.getAttribute("id");
  if (!id) {
    throw new Error(`BirzhaSelect trigger ${triggerSelector} has no id`);
  }
  return page.locator(`#${id}-listbox`);
}

export async function openBirzhaSelect(page: Page, triggerSelector: string): Promise<Locator> {
  const trigger = page.locator(triggerSelector);
  await expect(trigger).toBeEnabled({ timeout: 15_000 });
  await trigger.click();
  const listbox = await listboxForTrigger(page, triggerSelector);
  await expect(listbox).toBeVisible();
  return listbox;
}

export async function closeBirzhaSelect(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
}

/** Выбрать опцию кастомного BirzhaSelect по подстроке в подписи. */
export async function pickBirzhaSelectByLabel(
  page: Page,
  triggerSelector: string,
  label: string | RegExp,
): Promise<void> {
  const listbox = await openBirzhaSelect(page, triggerSelector);
  await listbox.getByRole("option", { name: label }).click();
}

/** Первая опция, отличная от плейсхолдера «— выберите …». */
export async function pickBirzhaSelectFirstRealOption(page: Page, triggerSelector: string): Promise<void> {
  const listbox = await openBirzhaSelect(page, triggerSelector);
  const options = listbox.getByRole("option");
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const opt = options.nth(i);
    const text = (await opt.textContent())?.trim() ?? "";
    if (!text || text.startsWith("—") || /выберите|загрузка/i.test(text)) {
      continue;
    }
    await opt.click();
    return;
  }
  throw new Error(`No selectable option in BirzhaSelect ${triggerSelector}`);
}

/** Проверить наличие опции в BirzhaSelect (список закрывается Escape). */
export async function expectBirzhaSelectHasOption(
  page: Page,
  triggerSelector: string,
  label: string | RegExp,
): Promise<void> {
  const listbox = await openBirzhaSelect(page, triggerSelector);
  await expect(listbox.getByRole("option", { name: label })).toBeVisible();
  await closeBirzhaSelect(page);
}

export function birzhaSelectTrigger(page: Page, triggerSelector: string) {
  return page.locator(triggerSelector);
}
