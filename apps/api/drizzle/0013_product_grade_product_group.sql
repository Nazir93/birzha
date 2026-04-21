ALTER TABLE "product_grades" ADD COLUMN IF NOT EXISTS "product_group" text;
UPDATE "product_grades" SET "product_group" = 'Помидоры' WHERE "id" IN (
  'pg-n5', 'pg-n6', 'pg-n7', 'pg-n8', 'pg-nsm', 'pg-nsp', 'pg-om'
) AND "product_group" IS NULL;
