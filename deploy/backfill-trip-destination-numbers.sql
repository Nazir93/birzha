-- Город на рейсе + перенумерация 01, 02… в рамках каждого города.
-- Перед применением на проде — свежий pg_dump.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS destination_code text
  REFERENCES ship_destinations (code);

-- Город со старых рейсов — из первой привязанной ПН.
UPDATE trips t
SET destination_code = sub.destination_code
FROM (
  SELECT DISTINCT ON (trip_id)
    trip_id,
    destination_code
  FROM loading_manifests
  WHERE trip_id IS NOT NULL
  ORDER BY trip_id, created_at ASC
) sub
WHERE t.id = sub.trip_id
  AND t.destination_code IS NULL;

-- Перенумерация: по каждому городу 01, 02, 03… (по дате выезда, затем id).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY destination_code
      ORDER BY departed_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM trips
  WHERE destination_code IS NOT NULL
)
UPDATE trips t
SET trip_number = CASE
  WHEN ranked.rn < 10 THEN '0' || ranked.rn::text
  ELSE ranked.rn::text
END
FROM ranked
WHERE t.id = ranked.id;
