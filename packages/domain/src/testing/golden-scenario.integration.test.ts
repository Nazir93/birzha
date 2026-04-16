import { describe, it } from "vitest";

/**
 * Доменный пакет: полный золотой сценарий живёт в API (`apps/api/.../golden-scenario.flow.test.ts`).
 * Здесь оставляем заготовки расширений домена без HTTP.
 */
describe.skip("golden scenario — домен (расширения)", () => {
  it.todo("приёмка рейса с недостачей в домене Batch/Trip");
  it.todo("долги и оплаты — после согласования правил");
});
