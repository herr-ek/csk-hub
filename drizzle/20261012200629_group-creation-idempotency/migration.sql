ALTER TABLE "group_conversation" ADD COLUMN "creation_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "group_conversation" ADD COLUMN "creation_payload_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "groupConversation_creator_creation_key_unique" ON "group_conversation" USING btree ("created_by_user_id","creation_idempotency_key");--> statement-breakpoint
ALTER TABLE "group_conversation" ADD CONSTRAINT "groupConversation_creation_intent_check" CHECK (("group_conversation"."creation_idempotency_key" IS NULL AND "group_conversation"."creation_payload_hash" IS NULL)
        OR ("group_conversation"."creation_idempotency_key" IS NOT NULL AND length(btrim("group_conversation"."creation_idempotency_key")) > 0
          AND "group_conversation"."creation_payload_hash" IS NOT NULL));