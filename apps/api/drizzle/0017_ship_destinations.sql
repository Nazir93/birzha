CREATE TABLE IF NOT EXISTS "ship_destinations" (
	"code" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);

INSERT INTO "ship_destinations" ("code", "display_name", "sort_order", "is_active") VALUES
	('moscow', 'Москва', 10, true),
	('regions', 'Регионы', 20, true),
	('discount', 'Уценка / распродажа', 30, true),
	('writeoff', 'Списание', 40, true)
ON CONFLICT ("code") DO NOTHING;
