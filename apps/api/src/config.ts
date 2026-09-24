import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default("0.0.0.0"),
    DATABASE_URL: z.string().url().optional(),
    /** Обязателен, если задан `DATABASE_URL` (подпись JWT для `/auth/*`). */
    JWT_SECRET: z.string().min(32).optional(),
    /**
     * Если `true` / `1`: бизнес-маршруты требуют JWT и роли; веб уводит на `/login`.
     * В **production** при заданных `DATABASE_URL` и `JWT_SECRET`, если переменную **не задавать** —
     * считается `true` (см. `loadEnv`). Явно `false` / `0` отключает проверку (только если осознанно).
     */
    REQUIRE_API_AUTH: z
      .string()
      .optional()
      .transform((v): boolean => v === "true" || v === "1"),
    /** Web Push (PWA): публичный VAPID-ключ; без пары ключей push отключён. */
    VAPID_PUBLIC_KEY: z.string().min(20).optional(),
    VAPID_PRIVATE_KEY: z.string().min(20).optional(),
    /** mailto: или https: контакт для VAPID (требование спецификации). */
    VAPID_SUBJECT: z.string().min(3).default("mailto:admin@24birzha.ru"),
  })
  .superRefine((data, ctx) => {
    if (data.DATABASE_URL && !data.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "JWT_SECRET обязателен при DATABASE_URL (минимум 32 символа)",
        path: ["JWT_SECRET"],
      });
    }
    if (data.REQUIRE_API_AUTH && !data.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REQUIRE_API_AUTH требует JWT_SECRET (и обычно DATABASE_URL)",
        path: ["REQUIRE_API_AUTH"],
      });
    }
    if (data.REQUIRE_API_AUTH && !data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REQUIRE_API_AUTH требует DATABASE_URL (маршруты /auth и проверка ролей)",
        path: ["REQUIRE_API_AUTH"],
      });
    }
    const hasPub = Boolean(data.VAPID_PUBLIC_KEY?.trim());
    const hasPriv = Boolean(data.VAPID_PRIVATE_KEY?.trim());
    if (hasPub !== hasPriv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY задаются вместе",
        path: hasPub ? ["VAPID_PRIVATE_KEY"] : ["VAPID_PUBLIC_KEY"],
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(overrides?: Partial<Record<string, string | undefined>>): AppEnv {
  const merged = { ...process.env, ...overrides };
  const explicitRequireApiAuth = merged.REQUIRE_API_AUTH;
  const parsed = envSchema.parse(merged);

  const inferProdRequireAuth =
    parsed.NODE_ENV === "production" &&
    Boolean(parsed.DATABASE_URL) &&
    Boolean(parsed.JWT_SECRET) &&
    explicitRequireApiAuth === undefined;

  if (inferProdRequireAuth) {
    return { ...parsed, REQUIRE_API_AUTH: true };
  }

  return parsed;
}
