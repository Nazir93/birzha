CREATE TABLE "roles" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role_code" text NOT NULL,
	"scope_type" text DEFAULT 'global' NOT NULL,
	"scope_id" text DEFAULT '' NOT NULL,
	CONSTRAINT "user_roles_user_id_role_code_scope_type_scope_id_pk" PRIMARY KEY("user_id","role_code","scope_type","scope_id")
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_code_roles_code_fk" FOREIGN KEY ("role_code") REFERENCES "public"."roles"("code") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "roles" ("code", "name") VALUES
	('admin', 'Администратор'),
	('manager', 'Руководитель'),
	('purchaser', 'Закупщик'),
	('warehouse', 'Кладовщик'),
	('logistics', 'Логист'),
	('receiver', 'Приёмщик'),
	('seller', 'Продавец'),
	('accountant', 'Бухгалтер')
ON CONFLICT ("code") DO NOTHING;
