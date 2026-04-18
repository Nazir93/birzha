import { defineConfig } from "drizzle-kit";

/** drizzle-kit push сравнивает снимки через JSON.stringify; драйвер PG отдаёт bigint как BigInt. */
{
  const orig = JSON.stringify;
  JSON.stringify = (value: unknown, replacer?: unknown, space?: string | number) =>
    orig(
      value,
      (key: string, val: unknown) => {
        const next = typeof val === "bigint" ? val.toString() : val;
        if (typeof replacer === "function") {
          return (replacer as (k: string, v: unknown) => unknown)(key, next);
        }
        return next;
      },
      space,
    );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/birzha",
  },
});
