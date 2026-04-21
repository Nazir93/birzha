import { randomUUID } from "node:crypto";

/** Код для нового склада, если пользователь не задал свой (латиница, уникальность в БД). */
export function autoWarehouseCode(): string {
  return `WH_${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export function isPgUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23505";
}
