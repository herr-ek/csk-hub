ALTER TABLE "post" ALTER COLUMN "body" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "body_search" "tsvector" GENERATED ALWAYS AS (to_tsvector('swedish', jsonb_path_query_array("body", 'strict $.**.text')::text)) STORED;--> statement-breakpoint
CREATE INDEX "post_body_search_idx" ON "post" USING gin ("body_search");