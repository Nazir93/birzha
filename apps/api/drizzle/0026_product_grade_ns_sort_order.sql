-- НС+ перед НС- (канонический порядок калибров в накладных).
UPDATE "product_grades" SET "sort_order" = 20 WHERE "id" = 'pg-nsp';
UPDATE "product_grades" SET "sort_order" = 21 WHERE "id" = 'pg-nsm';
