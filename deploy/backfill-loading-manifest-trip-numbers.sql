-- Синхронизация номера ПН с актуальным № рейса (после нумерации по городам).
-- Формат: «01 · Москва · 17.07.2026». Перед применением — свежий pg_dump.

UPDATE loading_manifests lm
SET manifest_number = sub.new_number
FROM (
  SELECT
    lm2.id,
    (
      t.trip_number
      || ' · '
      || COALESCE(NULLIF(TRIM(sd.display_name), ''), lm2.destination_code)
      || ' · '
      || to_char(lm2.doc_date, 'DD.MM.YYYY')
    ) AS new_number
  FROM loading_manifests lm2
  INNER JOIN trips t ON t.id = lm2.trip_id
  LEFT JOIN ship_destinations sd ON sd.code = lm2.destination_code
  WHERE lm2.trip_id IS NOT NULL
) sub
WHERE lm.id = sub.id
  AND lm.manifest_number IS DISTINCT FROM sub.new_number
  AND NOT EXISTS (
    SELECT 1
    FROM loading_manifests other
    WHERE other.manifest_number = sub.new_number
      AND other.id <> sub.id
  );
