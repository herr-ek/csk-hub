ALTER TABLE "post" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "discarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_discarded_draft_check" CHECK ("post"."discarded_at" is null or "post"."published_at" is null);