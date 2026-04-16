CREATE TABLE "sync_processed_actions" (
	"device_id" text NOT NULL,
	"local_action_id" text NOT NULL,
	CONSTRAINT "sync_processed_actions_device_id_local_action_id_pk" PRIMARY KEY("device_id","local_action_id")
);
