CREATE TABLE "news_feed_read_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news_feed_read_state" ADD CONSTRAINT "news_feed_read_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;