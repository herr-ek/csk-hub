-- Written by hand: drizzle-kit names the domain "undefined"."voice_division". A singer's Voice in a
-- Section is always a division, as B1 or B2 in KKB, which sings B; never the family itself. The
-- trigger from 0011_groups.sql depends on the column, so it is dropped around the change.
DROP TRIGGER "group_member_voice_check" ON "group_member";--> statement-breakpoint
ALTER TABLE "group_member" ALTER COLUMN "voice" SET DATA TYPE "public"."voice_division";--> statement-breakpoint
-- Added by hand: the `group_member_voice_check` trigger function from 0011_groups.sql, with the cast
-- that comparing a `voice_division` with a `voice` now needs. Postgres has no `=` for a domain over
-- an enum.
CREATE OR REPLACE FUNCTION "group_member_voice_check"() RETURNS trigger LANGUAGE plpgsql AS $$
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
		AND NOT coalesce(NEW."voice"::"voice" = section_voice OR left(NEW."voice"::text, 1) = section_voice::text, false) THEN
		RAISE EXCEPTION 'Voice % is not contained in the Section''s Voice %.', NEW."voice", section_voice
			USING ERRCODE = 'check_violation', TABLE = 'group_member', CONSTRAINT = 'group_member_voice_containment_check';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "group_member_voice_check" BEFORE INSERT OR UPDATE OF "group_id", "voice" ON "group_member"
FOR EACH ROW EXECUTE FUNCTION "group_member_voice_check"();
