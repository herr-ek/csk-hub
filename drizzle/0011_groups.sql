CREATE TYPE "public"."group_type" AS ENUM('Choir', 'Section', 'Board', 'Committee', 'GigGroup', 'Gigmästeri', 'Sexmästeri', 'Rodd', 'Fest', 'Rephelg', 'Konsert');--> statement-breakpoint
CREATE TYPE "public"."voice" AS ENUM('S', 'A', 'T', 'B', 'S1', 'S2', 'A1', 'A2', 'T1', 'T2', 'B1', 'B2');--> statement-breakpoint
-- Added by hand, because Drizzle cannot express domains: the Voice family and Voice division as
-- restricted subtypes of `voice`, so the database has the same three types as the code.
CREATE DOMAIN "public"."voice_family" AS "public"."voice"
	CONSTRAINT "voice_family_check" CHECK (VALUE IN ('S', 'A', 'T', 'B'));--> statement-breakpoint
CREATE DOMAIN "public"."voice_division" AS "public"."voice"
	CONSTRAINT "voice_division_check" CHECK (VALUE IN ('S1', 'S2', 'A1', 'A2', 'T1', 'T2', 'B1', 'B2'));--> statement-breakpoint
CREATE TABLE "choir" (
	"group_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "group_type" NOT NULL,
	"choir_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "group_name_not_blank_check" CHECK (length(btrim("group"."name")) > 0),
	CONSTRAINT "group_choir_csk_wide_check" CHECK ("group"."type" <> 'Choir' OR "group"."choir_id" IS NULL),
	CONSTRAINT "group_section_in_choir_check" CHECK ("group"."type" <> 'Section' OR "group"."choir_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"voice" "voice",
	CONSTRAINT "group_member_user_id_group_id_start_date_pk" PRIMARY KEY("user_id","group_id","start_date"),
	CONSTRAINT "group_member_period_check" CHECK ("group_member"."end_date" IS NULL OR "group_member"."end_date" >= "group_member"."start_date")
);
--> statement-breakpoint
CREATE TABLE "group_type_position" (
	"type" "group_type" NOT NULL,
	"position_id" uuid NOT NULL,
	CONSTRAINT "group_type_position_type_position_id_pk" PRIMARY KEY("type","position_id")
);
--> statement-breakpoint
CREATE TABLE "position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "position_name_not_blank_check" CHECK (length(btrim("position"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "position_holder" (
	"user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "position_holder_user_id_group_id_position_id_start_date_pk" PRIMARY KEY("user_id","group_id","position_id","start_date"),
	CONSTRAINT "position_holder_period_check" CHECK ("position_holder"."end_date" IS NULL OR "position_holder"."end_date" >= "position_holder"."start_date")
);
--> statement-breakpoint
CREATE TABLE "section" (
	"group_id" uuid PRIMARY KEY NOT NULL,
	"voice" "voice" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_capability" (
	"user_id" text NOT NULL,
	"voice" "voice_division" NOT NULL,
	CONSTRAINT "voice_capability_user_id_voice_pk" PRIMARY KEY("user_id","voice")
);
--> statement-breakpoint
ALTER TABLE "choir" ADD CONSTRAINT "choir_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_choir_id_choir_group_id_fk" FOREIGN KEY ("choir_id") REFERENCES "public"."choir"("group_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_type_position" ADD CONSTRAINT "group_type_position_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_holder" ADD CONSTRAINT "position_holder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_holder" ADD CONSTRAINT "position_holder_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_holder" ADD CONSTRAINT "position_holder_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_capability" ADD CONSTRAINT "voice_capability_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Added by hand: NULLS NOT DISTINCT, which Drizzle cannot express, so CSK-wide names (choir_id null) are unique too.
CREATE UNIQUE INDEX "group_name_choir_active_unique" ON "group" USING btree ("name","choir_id") NULLS NOT DISTINCT WHERE "group"."active";--> statement-breakpoint
CREATE INDEX "group_choirId_idx" ON "group" USING btree ("choir_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_member_current_unique" ON "group_member" USING btree ("user_id","group_id") WHERE "group_member"."end_date" IS NULL;--> statement-breakpoint
CREATE INDEX "group_member_groupId_idx" ON "group_member" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "position_name_unique" ON "position" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "position_holder_current_unique" ON "position_holder" USING btree ("group_id","position_id") WHERE "position_holder"."end_date" IS NULL;--> statement-breakpoint
CREATE INDEX "position_holder_userId_idx" ON "position_holder" USING btree ("user_id");--> statement-breakpoint
-- Added by hand, because Drizzle cannot express triggers. A Membership has a Voice exactly when its
-- group is a Section, and that Voice is contained in the Section's: B, B1 or B2 in KKB (which sings
-- B), only B1 in MKB1. The errors name a constraint so the groups module can map them to violations.
CREATE FUNCTION "group_member_voice_check"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	group_type "group_type";
	section_voice "voice";
BEGIN
	SELECT g."type", s."voice" INTO group_type, section_voice
	FROM "group" g LEFT JOIN "section" s ON s."group_id" = g."id"
	WHERE g."id" = NEW."group_id";

	IF (group_type = 'Section') <> (NEW."voice" IS NOT NULL) THEN
		RAISE EXCEPTION 'A Membership has a Voice exactly when its group is a Section.'
			USING ERRCODE = 'check_violation', TABLE = 'group_member', CONSTRAINT = 'group_member_voice_section_check';
	END IF;
	IF group_type = 'Section'
		AND NOT coalesce(NEW."voice" = section_voice OR left(NEW."voice"::text, 1) = section_voice::text, false) THEN
		RAISE EXCEPTION 'Voice % is not contained in the Section''s Voice %.', NEW."voice", section_voice
			USING ERRCODE = 'check_violation', TABLE = 'group_member', CONSTRAINT = 'group_member_voice_containment_check';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "group_member_voice_check" BEFORE INSERT OR UPDATE OF "group_id", "voice" ON "group_member"
FOR EACH ROW EXECUTE FUNCTION "group_member_voice_check"();