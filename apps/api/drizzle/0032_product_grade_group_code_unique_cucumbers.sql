-- Код калибра уникален внутри товара (product_group), не глобально:
-- у помидоров и огурцов могут быть одинаковые «НС+» / «НС-».
UPDATE "product_grades" SET "product_group" = 'Помидоры' WHERE "product_group" IS NULL;

ALTER TABLE "product_grades" DROP CONSTRAINT IF EXISTS "product_grades_code_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "product_grades_product_group_code_uidx"
  ON "product_grades" ("product_group", "code");

INSERT INTO "product_grades" ("id", "code", "display_name", "product_group", "sort_order", "is_active")
VALUES
  ('pg-cu-cornishon', 'Корнишон', 'Корнишон', 'Огурцы', 1, true),
  ('pg-cu-euro-msk', 'Евро Москва', 'Евро Москва', 'Огурцы', 2, true),
  ('pg-cu-krupnye', 'крупные', 'крупные', 'Огурцы', 4, true),
  ('pg-cu-matovy', 'матовый', 'матовый', 'Огурцы', 5, true),
  ('pg-cu-nsp', 'НС+', 'НС+', 'Огурцы', 20, true),
  ('pg-cu-nsm', 'НС-', 'НС-', 'Огурцы', 21, true)
ON CONFLICT ("id") DO NOTHING;
