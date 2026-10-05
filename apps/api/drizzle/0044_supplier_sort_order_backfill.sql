-- Порядковые номера тепличников (sort_order): проставить тем, у кого 0.
WITH zeros AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at ASC, name ASC) AS rn
  FROM suppliers
  WHERE sort_order = 0
),
base AS (
  SELECT coalesce(max(sort_order), 0) AS m
  FROM suppliers
  WHERE sort_order > 0
)
UPDATE suppliers AS s
SET sort_order = (SELECT m FROM base) + z.rn
FROM zeros AS z
WHERE s.id = z.id;
