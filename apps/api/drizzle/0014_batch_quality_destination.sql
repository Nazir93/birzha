-- Качество (после сортировки) и бизнес-направление: Москва / регионы / уценка / списание.
ALTER TABLE "batches" ADD COLUMN "quality_tier" text;
ALTER TABLE "batches" ADD COLUMN "destination" text;
