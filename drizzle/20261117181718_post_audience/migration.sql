CREATE TABLE "post_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"post_id" uuid NOT NULL,
	"group_id" uuid,
	"voice_family" voice_family,
	CONSTRAINT "post_target_unique" UNIQUE NULLS NOT DISTINCT("post_id","group_id","voice_family"),
	CONSTRAINT "post_target_not_empty_check" CHECK ("group_id" IS NOT NULL OR "voice_family" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "publisher_group_id" uuid;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "last_editor_id" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "last_editor_recorded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "first_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "audience_all" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "post_target_post_idx" ON "post_target" ("post_id");--> statement-breakpoint
CREATE INDEX "post_target_group_idx" ON "post_target" ("group_id");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_publisher_group_id_group_id_fkey" FOREIGN KEY ("publisher_group_id") REFERENCES "group"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_last_editor_id_user_id_fkey" FOREIGN KEY ("last_editor_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "post_target" ADD CONSTRAINT "post_target_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_target" ADD CONSTRAINT "post_target_group_id_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT;