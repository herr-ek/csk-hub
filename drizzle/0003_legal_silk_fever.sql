CREATE TYPE "public"."push_subscription_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"expiration_time" timestamp,
	"user_agent" text,
	"device_label" text,
	"status" "push_subscription_status" DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp,
	"disabled_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_idx" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_user_status_idx" ON "push_subscription" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "push_subscription_status_seen_idx" ON "push_subscription" USING btree ("status","last_seen_at");