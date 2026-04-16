CREATE TABLE "batches" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_id" text NOT NULL,
	"total_grams" bigint NOT NULL,
	"pending_inbound_grams" bigint NOT NULL,
	"on_warehouse_grams" bigint NOT NULL,
	"in_transit_grams" bigint NOT NULL,
	"sold_grams" bigint NOT NULL,
	"written_off_grams" bigint NOT NULL,
	"price_per_kg" numeric(18, 6) NOT NULL
);
