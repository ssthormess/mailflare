CREATE TABLE "smart_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mailbox_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smart_folders" ADD CONSTRAINT "smart_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_folders" ADD CONSTRAINT "smart_folders_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "smart_folders_mailbox_domain_idx" ON "smart_folders" USING btree ("mailbox_id","domain");--> statement-breakpoint
CREATE INDEX "smart_folders_mailbox_idx" ON "smart_folders" USING btree ("mailbox_id");--> statement-breakpoint
CREATE INDEX "smart_folders_user_idx" ON "smart_folders" USING btree ("user_id");
