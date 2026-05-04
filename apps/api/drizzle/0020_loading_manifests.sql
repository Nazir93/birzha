CREATE TABLE IF NOT EXISTS "loading_manifests" (
  "id" text PRIMARY KEY NOT NULL,
  "manifest_number" text NOT NULL,
  "doc_date" date NOT NULL,
  "warehouse_id" text NOT NULL,
  "destination_code" text NOT NULL,
  "trip_id" text,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "loading_manifests_manifest_number_unique" UNIQUE ("manifest_number")
);

CREATE TABLE IF NOT EXISTS "loading_manifest_lines" (
  "manifest_id" text NOT NULL,
  "batch_id" text NOT NULL,
  "line_no" integer NOT NULL,
  "grams" bigint NOT NULL,
  "package_count" bigint,
  CONSTRAINT "loading_manifest_lines_manifest_id_batch_id_pk" PRIMARY KEY ("manifest_id","batch_id")
);

DO $$ BEGIN
 ALTER TABLE "loading_manifests" ADD CONSTRAINT "loading_manifests_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "loading_manifests" ADD CONSTRAINT "loading_manifests_destination_code_ship_destinations_code_fk" FOREIGN KEY ("destination_code") REFERENCES "ship_destinations"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "loading_manifests" ADD CONSTRAINT "loading_manifests_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "loading_manifests" ADD CONSTRAINT "loading_manifests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "loading_manifest_lines" ADD CONSTRAINT "loading_manifest_lines_manifest_id_loading_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "loading_manifests"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "loading_manifest_lines" ADD CONSTRAINT "loading_manifest_lines_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
