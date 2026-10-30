CREATE TYPE "public"."attendance_status" AS ENUM('Present', 'Excused', 'Absent');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('Draft', 'Published', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('Rehearsal', 'Gig', 'Concert', 'Social', 'Rephelg', 'Körmöte', 'Booking', 'Meeting', 'Other');--> statement-breakpoint
CREATE TYPE "public"."participation_mode" AS ENUM('None', 'ResponseRequired', 'ResponseRequiredStrict', 'Registration');--> statement-breakpoint
CREATE TYPE "public"."registration_question_kind" AS ENUM('Text', 'SingleChoice', 'MultipleChoice', 'Checkbox');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('Registered', 'Withdrawn');--> statement-breakpoint
CREATE TYPE "public"."rsvp_answer" AS ENUM('Yes', 'No', 'Maybe');--> statement-breakpoint
CREATE TABLE "absence_reason" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "absence_reason_label_not_blank_check" CHECK (length(btrim("absence_reason"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "event_type" NOT NULL,
	"status" "event_status" DEFAULT 'Draft' NOT NULL,
	"title" text NOT NULL,
	"description" jsonb,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location_id" uuid,
	"location_text" text,
	"call_time" timestamp with time zone,
	"respond_by" timestamp with time zone,
	"participation_mode" "participation_mode" NOT NULL,
	"organiser_group_id" uuid,
	"series_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_id_type_unique" UNIQUE("id","type"),
	CONSTRAINT "event_title_not_blank_check" CHECK (length(btrim("event"."title")) > 0),
	CONSTRAINT "event_period_check" CHECK ("event"."ends_at" > "event"."starts_at"),
	CONSTRAINT "event_call_time_check" CHECK ("event"."call_time" IS NULL OR "event"."call_time" <= "event"."starts_at"),
	CONSTRAINT "event_respond_by_check" CHECK ("event"."respond_by" IS NULL OR "event"."respond_by" <= "event"."starts_at"),
	CONSTRAINT "event_respond_by_mode_check" CHECK ("event"."participation_mode" <> 'None' OR "event"."respond_by" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "event_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text,
	"status" "attendance_status" NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_attendance_event_user_unique" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "event_detail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "event_detail_label_not_blank_check" CHECK (length(btrim("event_detail"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "event_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text,
	"status" "registration_status" DEFAULT 'Registered' NOT NULL,
	"comment" text,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "event_registration_event_user_unique" UNIQUE("event_id","user_id"),
	CONSTRAINT "event_registration_withdrawn_check" CHECK (("event_registration"."status" = 'Withdrawn') = ("event_registration"."withdrawn_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "event_registration_answer" (
	"registration_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"text" text,
	"checked" boolean,
	CONSTRAINT "event_registration_answer_pk" PRIMARY KEY("registration_id","question_id"),
	CONSTRAINT "event_registration_answer_one_value_check" CHECK ("event_registration_answer"."text" IS NULL OR "event_registration_answer"."checked" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "event_registration_answer_choice" (
	"registration_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	CONSTRAINT "event_registration_answer_choice_pk" PRIMARY KEY("registration_id","question_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "event_registration_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" "registration_question_kind" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "event_registration_question_label_not_blank_check" CHECK (length(btrim("event_registration_question"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "event_registration_question_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "event_registration_question_option_question_unique" UNIQUE("question_id","id"),
	CONSTRAINT "event_registration_question_option_label_not_blank_check" CHECK (length(btrim("event_registration_question_option"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "event_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text,
	"answer" "rsvp_answer" NOT NULL,
	"comment" text,
	"absence_reason_id" uuid,
	"reason_text" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_response_event_user_unique" UNIQUE("event_id","user_id"),
	CONSTRAINT "event_response_one_reason_check" CHECK ("event_response"."absence_reason_id" IS NULL OR "event_response"."reason_text" IS NULL),
	CONSTRAINT "event_response_reason_only_with_no_check" CHECK ("event_response"."answer" = 'No' OR ("event_response"."absence_reason_id" IS NULL AND "event_response"."reason_text" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "event_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_series_name_not_blank_check" CHECK (length(btrim("event_series"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "event_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"group_id" uuid,
	"voice_family" "voice_family",
	CONSTRAINT "event_target_unique" UNIQUE NULLS NOT DISTINCT("event_id","group_id","voice_family"),
	CONSTRAINT "event_target_not_empty_check" CHECK ("event_target"."group_id" IS NOT NULL OR "event_target"."voice_family" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "gig" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"type" "event_type" DEFAULT 'Gig' NOT NULL,
	"responsible_user_id" text,
	"contact_name" text,
	"contact_details" text,
	CONSTRAINT "gig_type_check" CHECK ("gig"."type" = 'Gig')
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"map_url" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "location_name_not_blank_check" CHECK (length(btrim("location"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "rehearsal" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"type" "event_type" DEFAULT 'Rehearsal' NOT NULL,
	"leader_user_id" text,
	CONSTRAINT "rehearsal_type_check" CHECK ("rehearsal"."type" = 'Rehearsal')
);
--> statement-breakpoint
CREATE TABLE "social_event" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"type" "event_type" DEFAULT 'Social' NOT NULL,
	"cost_info" text,
	CONSTRAINT "social_event_type_check" CHECK ("social_event"."type" = 'Social')
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organiser_group_id_group_id_fk" FOREIGN KEY ("organiser_group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_series_id_event_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."event_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_detail" ADD CONSTRAINT "event_detail_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration_answer" ADD CONSTRAINT "event_registration_answer_registration_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration_answer" ADD CONSTRAINT "event_registration_answer_question_fk" FOREIGN KEY ("question_id") REFERENCES "public"."event_registration_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration_answer_choice" ADD CONSTRAINT "event_registration_answer_choice_answer_fk" FOREIGN KEY ("registration_id","question_id") REFERENCES "public"."event_registration_answer"("registration_id","question_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration_answer_choice" ADD CONSTRAINT "event_registration_answer_choice_option_fk" FOREIGN KEY ("question_id","option_id") REFERENCES "public"."event_registration_question_option"("question_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration_question" ADD CONSTRAINT "event_registration_question_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration_question_option" ADD CONSTRAINT "event_registration_question_option_question_fk" FOREIGN KEY ("question_id") REFERENCES "public"."event_registration_question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_response" ADD CONSTRAINT "event_response_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_response" ADD CONSTRAINT "event_response_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_response" ADD CONSTRAINT "event_response_absence_reason_id_absence_reason_id_fk" FOREIGN KEY ("absence_reason_id") REFERENCES "public"."absence_reason"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_target" ADD CONSTRAINT "event_target_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_target" ADD CONSTRAINT "event_target_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig" ADD CONSTRAINT "gig_responsible_user_id_user_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig" ADD CONSTRAINT "gig_event_id_type_event_id_type_fk" FOREIGN KEY ("event_id","type") REFERENCES "public"."event"("id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehearsal" ADD CONSTRAINT "rehearsal_leader_user_id_user_id_fk" FOREIGN KEY ("leader_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehearsal" ADD CONSTRAINT "rehearsal_event_id_type_event_id_type_fk" FOREIGN KEY ("event_id","type") REFERENCES "public"."event"("id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_event" ADD CONSTRAINT "social_event_event_id_type_event_id_type_fk" FOREIGN KEY ("event_id","type") REFERENCES "public"."event"("id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "absence_reason_label_active_unique" ON "absence_reason" USING btree ("label") WHERE "absence_reason"."active";--> statement-breakpoint
CREATE INDEX "event_starts_at_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "event_series_id_idx" ON "event" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "event_organiser_group_id_idx" ON "event" USING btree ("organiser_group_id");--> statement-breakpoint
CREATE INDEX "event_attendance_user_id_idx" ON "event_attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_detail_event_id_idx" ON "event_detail" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_registration_user_id_idx" ON "event_registration" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_registration_answer_question_id_idx" ON "event_registration_answer" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "event_registration_answer_choice_option_idx" ON "event_registration_answer_choice" USING btree ("question_id","option_id");--> statement-breakpoint
CREATE INDEX "event_registration_question_event_id_idx" ON "event_registration_question" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_response_user_id_idx" ON "event_response" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_target_group_id_idx" ON "event_target" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_name_active_unique" ON "location" USING btree ("name") WHERE "location"."active";--> statement-breakpoint
-- Added by hand, because Drizzle cannot express triggers (1): an Event's Responses, Registrations
-- and Registration questions exist only while its mode collects them, so a mode change that would
-- strand them is refused. Switching between the two response modes rewrites nothing and is fine.
CREATE FUNCTION "event_participation_mode_change_check"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."participation_mode" NOT IN ('ResponseRequired', 'ResponseRequiredStrict')
		AND EXISTS (SELECT 1 FROM "event_response" WHERE "event_id" = NEW."id") THEN
		RAISE EXCEPTION 'Event % has Responses, which mode % does not collect.', NEW."id", NEW."participation_mode"
			USING ERRCODE = 'check_violation', TABLE = 'event', CONSTRAINT = 'event_participation_mode_change_check';
	END IF;
	IF NEW."participation_mode" <> 'Registration'
		AND (EXISTS (SELECT 1 FROM "event_registration" WHERE "event_id" = NEW."id")
			OR EXISTS (SELECT 1 FROM "event_registration_question" WHERE "event_id" = NEW."id")) THEN
		RAISE EXCEPTION 'Event % has Registrations or Registration questions, which mode % does not collect.',
			NEW."id", NEW."participation_mode"
			USING ERRCODE = 'check_violation', TABLE = 'event', CONSTRAINT = 'event_participation_mode_change_check';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "event_participation_mode_change_check" BEFORE UPDATE OF "participation_mode" ON "event"
FOR EACH ROW WHEN (OLD."participation_mode" IS DISTINCT FROM NEW."participation_mode")
EXECUTE FUNCTION "event_participation_mode_change_check"();--> statement-breakpoint
-- Added by hand (2): a Response goes only to a Published Event in a response mode, and in
-- ResponseRequiredStrict it is Yes, or No with a reason. The Event row is share-locked so that a
-- concurrent mode or status change waits for this transaction rather than slipping past the check.
-- A missing Event is left to the foreign key to report.
CREATE FUNCTION "event_response_check"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	event_status "event_status";
	event_mode "participation_mode";
BEGIN
	SELECT e."status", e."participation_mode" INTO event_status, event_mode
	FROM "event" e WHERE e."id" = NEW."event_id" FOR SHARE;
	IF NOT FOUND THEN
		RETURN NEW;
	END IF;

	IF event_status <> 'Published' OR event_mode NOT IN ('ResponseRequired', 'ResponseRequiredStrict') THEN
		RAISE EXCEPTION 'Event % takes no Responses: it is % in mode %.', NEW."event_id", event_status, event_mode
			USING ERRCODE = 'check_violation', TABLE = 'event_response', CONSTRAINT = 'event_response_mode_check';
	END IF;
	IF event_mode = 'ResponseRequiredStrict' AND (NEW."answer" = 'Maybe' OR (NEW."answer" = 'No'
		AND NEW."absence_reason_id" IS NULL AND coalesce(btrim(NEW."reason_text"), '') = '')) THEN
		RAISE EXCEPTION 'Event % requires Yes, or No with a reason.', NEW."event_id"
			USING ERRCODE = 'check_violation', TABLE = 'event_response', CONSTRAINT = 'event_response_strict_check';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "event_response_check"
BEFORE INSERT OR UPDATE OF "event_id", "answer", "absence_reason_id", "reason_text" ON "event_response"
FOR EACH ROW EXECUTE FUNCTION "event_response_check"();--> statement-breakpoint
-- Added by hand (3): a Registration belongs to an Event in Registration mode, and registering
-- (status Registered) needs the Event to be Published. Withdrawing is always possible.
CREATE FUNCTION "event_registration_check"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	event_status "event_status";
	event_mode "participation_mode";
BEGIN
	SELECT e."status", e."participation_mode" INTO event_status, event_mode
	FROM "event" e WHERE e."id" = NEW."event_id" FOR SHARE;
	IF NOT FOUND THEN
		RETURN NEW;
	END IF;

	IF event_mode <> 'Registration' OR (NEW."status" = 'Registered' AND event_status <> 'Published') THEN
		RAISE EXCEPTION 'Event % takes no Registrations: it is % in mode %.', NEW."event_id", event_status, event_mode
			USING ERRCODE = 'check_violation', TABLE = 'event_registration', CONSTRAINT = 'event_registration_mode_check';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "event_registration_check" BEFORE INSERT OR UPDATE OF "event_id", "status" ON "event_registration"
FOR EACH ROW EXECUTE FUNCTION "event_registration_check"();--> statement-breakpoint
-- Added by hand (4): Registration questions belong to an Event in Registration mode, Draft or not.
CREATE FUNCTION "event_registration_question_check"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	event_mode "participation_mode";
BEGIN
	SELECT e."participation_mode" INTO event_mode FROM "event" e WHERE e."id" = NEW."event_id" FOR SHARE;
	IF FOUND AND event_mode <> 'Registration' THEN
		RAISE EXCEPTION 'Event % asks no Registration questions: it is in mode %.', NEW."event_id", event_mode
			USING ERRCODE = 'check_violation', TABLE = 'event_registration_question',
				CONSTRAINT = 'event_registration_question_mode_check';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "event_registration_question_check" BEFORE INSERT OR UPDATE OF "event_id" ON "event_registration_question"
FOR EACH ROW EXECUTE FUNCTION "event_registration_question_check"();--> statement-breakpoint
-- Added by hand (5): an answered question belongs to the Registration's Event. A missing
-- Registration or question is left to the foreign keys to report.
CREATE FUNCTION "event_registration_answer_check"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	registration_event uuid;
	question_event uuid;
BEGIN
	SELECT "event_id" INTO registration_event FROM "event_registration" WHERE "id" = NEW."registration_id";
	SELECT "event_id" INTO question_event FROM "event_registration_question" WHERE "id" = NEW."question_id";
	IF registration_event <> question_event THEN
		RAISE EXCEPTION 'Question % is not asked by the Event of Registration %.', NEW."question_id", NEW."registration_id"
			USING ERRCODE = 'check_violation', TABLE = 'event_registration_answer',
				CONSTRAINT = 'event_registration_answer_question_check';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "event_registration_answer_check"
BEFORE INSERT OR UPDATE OF "registration_id", "question_id" ON "event_registration_answer"
FOR EACH ROW EXECUTE FUNCTION "event_registration_answer_check"();--> statement-breakpoint
-- Added by hand (6): Erasure. Deleting a User sets `user_id` to null through the foreign keys; these
-- triggers then wipe the free text that could still identify them. The preset absence reason,
-- Checkbox answers and choices stay, since they identify no one once `user_id` is gone.
CREATE FUNCTION "event_response_erasure"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	NEW."comment" := NULL;
	NEW."reason_text" := NULL;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "event_response_erasure" BEFORE UPDATE OF "user_id" ON "event_response"
FOR EACH ROW WHEN (OLD."user_id" IS NOT NULL AND NEW."user_id" IS NULL)
EXECUTE FUNCTION "event_response_erasure"();--> statement-breakpoint
CREATE FUNCTION "event_registration_erasure"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	NEW."comment" := NULL;
	UPDATE "event_registration_answer" SET "text" = NULL WHERE "registration_id" = NEW."id" AND "text" IS NOT NULL;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "event_registration_erasure" BEFORE UPDATE OF "user_id" ON "event_registration"
FOR EACH ROW WHEN (OLD."user_id" IS NOT NULL AND NEW."user_id" IS NULL)
EXECUTE FUNCTION "event_registration_erasure"();
