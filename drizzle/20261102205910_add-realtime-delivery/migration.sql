CREATE TABLE "activity_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"change" jsonb NOT NULL,
	"body" text,
	"title" text,
	"href" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"publish_after" timestamp with time zone DEFAULT now() NOT NULL,
	"push_after" timestamp with time zone,
	"push_completed_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid
);
--> statement-breakpoint
CREATE INDEX "activity_user_created_idx" ON "activity_delivery" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_publish_pending_idx" ON "activity_delivery" ("published_at","publish_after");--> statement-breakpoint
CREATE INDEX "activity_push_pending_idx" ON "activity_delivery" ("push_completed_at","push_after");--> statement-breakpoint
ALTER TABLE "activity_delivery" ADD CONSTRAINT "activity_delivery_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;