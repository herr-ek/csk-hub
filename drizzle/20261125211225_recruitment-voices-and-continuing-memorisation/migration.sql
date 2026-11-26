-- Added by hand: Utantillkommittén becomes one continuing Group. Its annual identities are removed and
-- `ops reference-data` creates the continuing one. References to them stop the migration.
DELETE FROM "group" WHERE "type" = 'memorisation-committee';--> statement-breakpoint
ALTER TABLE "direct_membership" ADD COLUMN "voice_family" voice_family;--> statement-breakpoint
DROP INDEX "group_continuing_singleton_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "group_continuing_singleton_unique" ON "group" ("type") WHERE "type" IN ('parents-meeting', 'memorisation-committee');--> statement-breakpoint
-- Added by hand: the Group policies, with Utantillkommittén continuing.
CREATE OR REPLACE FUNCTION organisation_group_policy(code text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"choir":{"scope":"csk","lifetime":"continuing","directMembership":"yes","cardinality":"existing-choirs"},"section":{"scope":"choir","lifetime":"continuing","directMembership":"placement","cardinality":"four-sections"},"board":{"scope":"csk","lifetime":"annual","directMembership":"no","cardinality":"singleton"},"gig-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"social-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"concert-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"recruitment-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"tour-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"nomination-committee":{"scope":"csk","lifetime":"annual","directMembership":"yes","cardinality":"singleton"},"web-team":{"scope":"csk","lifetime":"annual","directMembership":"yes","cardinality":"singleton"},"archives":{"scope":"csk","lifetime":"annual","directMembership":"yes","cardinality":"singleton"},"memorisation-committee":{"scope":"csk","lifetime":"continuing","directMembership":"yes","cardinality":"singleton"},"parents-meeting":{"scope":"csk","lifetime":"continuing","directMembership":"no","cardinality":"singleton"},"equipment-team":{"scope":"choir","lifetime":"fluid","directMembership":"yes","cardinality":"choir-singleton"},"party-team":{"scope":"choir","lifetime":"fluid","directMembership":"yes","cardinality":"choir-singleton"},"rehearsal-weekend-team":{"scope":"choir","lifetime":"fluid","directMembership":"yes","cardinality":"choir-singleton"},"gig-group":{"scope":"csk","lifetime":"fluid","directMembership":"yes","cardinality":"multiple"},"other":{"scope":"csk","lifetime":"fluid","directMembership":"yes","cardinality":"multiple"}}'::jsonb -> code
$$;
--> statement-breakpoint
-- Added by hand: Rekryteringskommittén's Helpers have a Voice family.
CREATE OR REPLACE FUNCTION check_direct_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target "group"; section_voice text; policy jsonb;
BEGIN
  SELECT * INTO target FROM "group" WHERE id = NEW.group_id;
  policy := organisation_group_policy(target.type::text);
  IF policy->>'directMembership' = 'no' THEN
    RAISE check_violation USING CONSTRAINT = 'direct_membership_policy_check';
  END IF;
  IF policy->>'lifetime' = 'annual' AND
    (target.organisation_year IS NULL OR NEW.end_date IS NULL
      OR NEW.start_date < make_date(target.organisation_year, 7, 1)
      OR NEW.end_date > make_date(target.organisation_year + 1, 7, 1)) THEN
    RAISE check_violation USING CONSTRAINT = 'direct_membership_annual_check';
  END IF;
  IF (target.type IN ('section', 'gig-group')) <> (NEW.voice IS NOT NULL)
    OR (target.type = 'recruitment-committee') <> (NEW.voice_family IS NOT NULL) THEN
    RAISE check_violation USING CONSTRAINT = 'direct_membership_voice_check';
  END IF;
  IF target.type = 'section' THEN
    SELECT voice::text INTO section_voice FROM section WHERE group_id = target.id;
    IF section_voice IS NULL OR NOT (section_voice = NEW.voice::text OR section_voice = left(NEW.voice::text, 1)) THEN
      RAISE check_violation USING CONSTRAINT = 'direct_membership_voice_check';
    END IF;
  END IF;
  RETURN NEW;
END $$;
