CREATE TABLE "trip_batch_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"grams" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_batch_sales" ADD CONSTRAINT "trip_batch_sales_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_batch_sales" ADD CONSTRAINT "trip_batch_sales_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;