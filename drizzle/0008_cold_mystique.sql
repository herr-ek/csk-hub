CREATE TYPE "public"."conversation_kind" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_message_sequence" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_read_state" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_sequence" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "conversation_read_state_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "conversationReadState_last_read_sequence_check" CHECK ("conversation_read_state"."last_read_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "direct_conversation" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"first_member_id" text NOT NULL,
	"second_member_id" text NOT NULL,
	CONSTRAINT "directConversation_member_pair_order_check" CHECK ("direct_conversation"."first_member_id" < "direct_conversation"."second_member_id")
);
--> statement-breakpoint
CREATE TABLE "group_conversation" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groupConversation_name_not_blank_check" CHECK (length(btrim("group_conversation"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "group_membership" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"history_visible_through_sequence" integer,
	CONSTRAINT "group_membership_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "groupMembership_departure_visibility_check" CHECK (("group_membership"."left_at" IS NULL) = ("group_membership"."history_visible_through_sequence" IS NULL)),
	CONSTRAINT "groupMembership_history_visible_through_sequence_check" CHECK ("group_membership"."history_visible_through_sequence" IS NULL OR "group_membership"."history_visible_through_sequence" >= 0)
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
	CONSTRAINT "message_sequence_check" CHECK ("message"."sequence" > 0),
	CONSTRAINT "message_text_not_blank_check" CHECK (length(btrim("message"."text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversation" ADD CONSTRAINT "direct_conversation_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversation" ADD CONSTRAINT "direct_conversation_first_member_id_user_id_fk" FOREIGN KEY ("first_member_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversation" ADD CONSTRAINT "direct_conversation_second_member_id_user_id_fk" FOREIGN KEY ("second_member_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_conversation" ADD CONSTRAINT "group_conversation_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_conversation" ADD CONSTRAINT "group_conversation_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_membership" ADD CONSTRAINT "group_membership_conversation_id_group_conversation_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."group_conversation"("conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_membership" ADD CONSTRAINT "group_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directConversation_member_pair_unique" ON "direct_conversation" USING btree ("first_member_id","second_member_id");--> statement-breakpoint
CREATE INDEX "groupMembership_userId_idx" ON "group_membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_conversation_sequence_unique" ON "message" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "message_author_idempotency_key_unique" ON "message" USING btree ("author_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "message_conversation_sent_at_idx" ON "message" USING btree ("conversation_id","sent_at");