CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_user_id" text,
	CONSTRAINT "conversation_kind_check" CHECK ("conversation"."kind" IN ('direct', 'group'))
);
--> statement-breakpoint
CREATE TABLE "conversation_membership" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"history_visible_from_sequence" integer DEFAULT 1 NOT NULL,
	"last_read_sequence" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "conversation_membership_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "conversationMembership_history_visible_from_sequence_check" CHECK ("conversation_membership"."history_visible_from_sequence" >= 1),
	CONSTRAINT "conversationMembership_last_read_sequence_check" CHECK ("conversation_membership"."last_read_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "direct_conversation" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"first_member_id" text,
	"second_member_id" text,
	CONSTRAINT "directConversation_member_pair_order_check" CHECK ("direct_conversation"."first_member_id" IS NULL OR "direct_conversation"."second_member_id" IS NULL OR "direct_conversation"."first_member_id" < "direct_conversation"."second_member_id")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"author_user_id" text,
	"text" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "message_sequence_check" CHECK ("message"."sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_membership" ADD CONSTRAINT "conversation_membership_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_membership" ADD CONSTRAINT "conversation_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversation" ADD CONSTRAINT "direct_conversation_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversation" ADD CONSTRAINT "direct_conversation_first_member_id_user_id_fk" FOREIGN KEY ("first_member_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversation" ADD CONSTRAINT "direct_conversation_second_member_id_user_id_fk" FOREIGN KEY ("second_member_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversationMembership_userId_idx" ON "conversation_membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "directConversation_member_pair_unique" ON "direct_conversation" USING btree ("first_member_id","second_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_conversation_sequence_unique" ON "message" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "message_conversation_author_idempotency_key_unique" ON "message" USING btree ("conversation_id","author_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "message_conversation_sequence_idx" ON "message" USING btree ("conversation_id","sequence");