CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "warehouses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_grades" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_grades_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchase_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"document_number" text NOT NULL,
	"doc_date" date NOT NULL,
	"supplier_name" text,
	"buyer_label" text,
	"warehouse_id" text NOT NULL,
	"extra_cost_kopecks" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "purchase_document_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_grade_id" text NOT NULL,
	"quantity_grams" bigint NOT NULL,
	"package_count" bigint,
	"price_per_kg" numeric NOT NULL,
	"line_total_kopecks" bigint NOT NULL,
	"batch_id" text NOT NULL,
	CONSTRAINT "purchase_document_lines_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "purchase_document_lines_document_line_unique" UNIQUE("document_id","line_no")
);
--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_document_id_purchase_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_product_grade_id_product_grades_id_fk" FOREIGN KEY ("product_grade_id") REFERENCES "public"."product_grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "warehouses" ("id", "code", "name") VALUES
('wh-manas', 'MANAS', 'Манас'),
('wh-kayakent', 'KAYAKENT', 'Каякент');--> statement-breakpoint
INSERT INTO "product_grades" ("id", "code", "display_name", "sort_order") VALUES
('pg-n5', '№5', 'Калибр №5', 5),
('pg-n6', '№6', 'Калибр №6', 6),
('pg-n7', '№7', 'Калибр №7', 7),
('pg-n8', '№8', 'Калибр №8', 8),
('pg-nsm', 'НС-', 'НС-', 20),
('pg-nsp', 'НС+', 'НС+', 21),
('pg-om', 'Ом.', 'Ом.', 30);
