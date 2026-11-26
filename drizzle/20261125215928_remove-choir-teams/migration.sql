-- Edited by hand. Roddgrupp, festgrupp and rephelgsgrupp are no longer Groups. Anything that refers to
-- one, such as a Membership or an Event, stops the migration.
DELETE FROM "group" WHERE "type" IN ('equipment-team', 'party-team', 'rehearsal-weekend-team');--> statement-breakpoint
-- PostgreSQL cannot drop enum values, and these compare "type" with the enum, so they are rebuilt with it.
DROP INDEX "group_choir_team_unique";--> statement-breakpoint
DROP INDEX "group_continuing_singleton_unique";--> statement-breakpoint
ALTER TABLE "group" DROP CONSTRAINT "group_name_policy_check";--> statement-breakpoint
ALTER TABLE "group" DROP CONSTRAINT "group_choir_csk_wide_check";--> statement-breakpoint
ALTER TABLE "group" DROP CONSTRAINT "group_section_in_choir_check";--> statement-breakpoint
ALTER TYPE "group_type" RENAME TO "group_type_with_choir_teams";--> statement-breakpoint
CREATE TYPE "group_type" AS ENUM('choir', 'section', 'board', 'gig-group', 'gig-committee', 'social-committee', 'concert-committee', 'recruitment-committee', 'tour-committee', 'nomination-committee', 'web-team', 'parents-meeting', 'archives', 'memorisation-committee', 'other');--> statement-breakpoint
ALTER TABLE "group" ALTER COLUMN "type" SET DATA TYPE "group_type" USING "type"::text::"group_type";--> statement-breakpoint
DROP TYPE "group_type_with_choir_teams";--> statement-breakpoint
CREATE UNIQUE INDEX "group_continuing_singleton_unique" ON "group" ("type") WHERE "type" IN ('parents-meeting', 'memorisation-committee');--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_name_policy_check" CHECK (
      CASE WHEN "type" IN ('choir', 'gig-group', 'other')
        THEN "name" IS NOT NULL AND length(btrim("name")) > 0
        ELSE "name" IS NULL END
    );--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_choir_csk_wide_check" CHECK ("type" <> 'choir' OR "choir_id" IS NULL);--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_section_in_choir_check" CHECK ("type" <> 'section' OR "choir_id" IS NOT NULL);--> statement-breakpoint
-- Added by hand: the Group policies, without Choir teams.
CREATE OR REPLACE FUNCTION organisation_group_policy(code text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"choir":{"scope":"csk","lifetime":"continuing","directMembership":"yes","cardinality":"existing-choirs"},"section":{"scope":"choir","lifetime":"continuing","directMembership":"placement","cardinality":"four-sections"},"board":{"scope":"csk","lifetime":"annual","directMembership":"no","cardinality":"singleton"},"gig-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"social-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"concert-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"recruitment-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"tour-committee":{"scope":"csk","lifetime":"annual","directMembership":"helpers","cardinality":"singleton"},"nomination-committee":{"scope":"csk","lifetime":"annual","directMembership":"yes","cardinality":"singleton"},"web-team":{"scope":"csk","lifetime":"annual","directMembership":"yes","cardinality":"singleton"},"archives":{"scope":"csk","lifetime":"annual","directMembership":"yes","cardinality":"singleton"},"memorisation-committee":{"scope":"csk","lifetime":"continuing","directMembership":"yes","cardinality":"singleton"},"parents-meeting":{"scope":"csk","lifetime":"continuing","directMembership":"no","cardinality":"singleton"},"gig-group":{"scope":"csk","lifetime":"fluid","directMembership":"yes","cardinality":"multiple"},"other":{"scope":"csk","lifetime":"fluid","directMembership":"yes","cardinality":"multiple"}}'::jsonb -> code
$$;
