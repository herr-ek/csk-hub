-- Refuse retained organisation data before renaming types or dropping legacy tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "group") THEN
    RAISE EXCEPTION 'Organisation redesign requires an empty Group table; see scripts/ops/README.md (PR #130).';
  END IF;
END $$;
--> statement-breakpoint
-- The previous schema still defines legacy enum values even when the Group table is empty.
ALTER TYPE "public"."group_type" RENAME VALUE 'Choir' TO 'choir';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Section' TO 'section';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Board' TO 'board';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'GigGroup' TO 'gig-group';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Gigmästeri' TO 'gig-committee';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Sexmästeri' TO 'social-committee';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Roddgrupp' TO 'equipment-team';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Festgrupp' TO 'party-team';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Rephelg' TO 'rehearsal-weekend-team';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Konsertmästeri' TO 'concert-committee';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Rekryteringskommitté' TO 'recruitment-committee';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Turnékommitté' TO 'tour-committee';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Valberedning' TO 'nomination-committee';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Webmästeri' TO 'web-team';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Föräldramötet' TO 'parents-meeting';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Arkivarie' TO 'archives';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Utantillkommitté' TO 'memorisation-committee';
--> statement-breakpoint
ALTER TYPE "public"."group_type" RENAME VALUE 'Övrig' TO 'other';
--> statement-breakpoint
CREATE TABLE "direct_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"voice" voice_division,
	CONSTRAINT "direct_membership_period_check" CHECK ("end_date" IS NULL OR "end_date" > "start_date")
);
--> statement-breakpoint
CREATE TABLE "position_appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"position_code" text NOT NULL,
	"context_group_id" uuid NOT NULL,
	"organisation_year" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "position_appointment_period_check" CHECK ("end_date" IS NULL OR "end_date" > "start_date"),
	CONSTRAINT "position_appointment_year_check" CHECK ("organisation_year" IS NULL OR "organisation_year" BETWEEN 1000 AND 9998)
);
--> statement-breakpoint
ALTER TABLE "group_type_position" DROP CONSTRAINT "group_type_position_position_id_position_id_fk";--> statement-breakpoint
ALTER TABLE "position_holder" DROP CONSTRAINT "position_holder_position_id_position_id_fk";--> statement-breakpoint
ALTER TABLE "position_group" DROP CONSTRAINT "position_group_position_id_position_id_fk";--> statement-breakpoint
DROP TRIGGER IF EXISTS "group_member_voice_check" ON "group_member";--> statement-breakpoint
DROP FUNCTION IF EXISTS "group_member_voice_check"();--> statement-breakpoint
DROP TABLE "group_member";--> statement-breakpoint
DROP TABLE "group_type_position";--> statement-breakpoint
DROP TABLE "position";--> statement-breakpoint
DROP TABLE "position_holder";--> statement-breakpoint
DROP TABLE "position_group";--> statement-breakpoint
ALTER TABLE "group" DROP CONSTRAINT "group_name_not_blank_check";--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "organisation_year" integer;--> statement-breakpoint
ALTER TABLE "group" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "group_name_choir_active_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "group_name_choir_active_unique" ON "group" ("name","choir_id") NULLS NOT DISTINCT WHERE "active" AND "name" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "direct_membership_group_idx" ON "direct_membership" ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_annual_identity_unique" ON "group" ("type","organisation_year") WHERE "organisation_year" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "group_continuing_singleton_unique" ON "group" ("type") WHERE "type" = 'parents-meeting';--> statement-breakpoint
CREATE UNIQUE INDEX "group_choir_team_unique" ON "group" ("type","choir_id") WHERE "active" AND "type" IN ('equipment-team', 'party-team', 'rehearsal-weekend-team');--> statement-breakpoint
CREATE INDEX "position_appointment_user_idx" ON "position_appointment" ("user_id");--> statement-breakpoint
ALTER TABLE "direct_membership" ADD CONSTRAINT "direct_membership_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "direct_membership" ADD CONSTRAINT "direct_membership_group_id_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "position_appointment" ADD CONSTRAINT "position_appointment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "position_appointment" ADD CONSTRAINT "position_appointment_context_group_id_group_id_fkey" FOREIGN KEY ("context_group_id") REFERENCES "group"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_organisation_year_check" CHECK ("organisation_year" IS NULL OR "organisation_year" BETWEEN 1000 AND 9998);--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_annual_active_check" CHECK ("organisation_year" IS NULL OR "active");--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_name_policy_check" CHECK (
      CASE WHEN "type" IN ('choir', 'gig-group', 'other')
        THEN "name" IS NOT NULL AND length(btrim("name")) > 0
        ELSE "name" IS NULL END
    );
--> statement-breakpoint
-- Added by hand: Drizzle cannot express range exclusion constraints or policy triggers.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE position_appointment ADD CONSTRAINT position_appointment_occupancy_excl
  EXCLUDE USING gist (context_group_id WITH =, position_code WITH =, daterange(start_date, end_date, '[)') WITH &&);
--> statement-breakpoint
ALTER TABLE position_appointment ADD CONSTRAINT position_appointment_board_excl
  EXCLUDE USING gist (context_group_id WITH =, user_id WITH =, daterange(start_date, end_date, '[)') WITH &&)
  WHERE (position_code IN ('ordforande', 'vice-ordforande', 'kassor', 'sekreterare', 'pr-mastare', 'forsta-konsertmastare', 'csk-gigmastare', 'sexmastare'));
--> statement-breakpoint
ALTER TABLE direct_membership ADD CONSTRAINT direct_membership_overlap_excl
  EXCLUDE USING gist (group_id WITH =, user_id WITH =, daterange(start_date, end_date, '[)') WITH &&);
--> statement-breakpoint
CREATE FUNCTION organisation_group_policy(code text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"choir": {"scope": "csk", "lifetime": "continuing", "directMembership": "yes", "cardinality": "existing-choirs"}, "section": {"scope": "choir", "lifetime": "continuing", "directMembership": "placement", "cardinality": "four-sections"}, "board": {"scope": "csk", "lifetime": "annual", "directMembership": "no", "cardinality": "singleton"}, "gig-committee": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "social-committee": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "concert-committee": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "recruitment-committee": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "tour-committee": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "nomination-committee": {"scope": "csk", "lifetime": "annual", "directMembership": "yes", "cardinality": "singleton"}, "web-team": {"scope": "csk", "lifetime": "annual", "directMembership": "yes", "cardinality": "singleton"}, "archives": {"scope": "csk", "lifetime": "annual", "directMembership": "yes", "cardinality": "singleton"}, "memorisation-committee": {"scope": "csk", "lifetime": "annual", "directMembership": "yes", "cardinality": "singleton"}, "parents-meeting": {"scope": "csk", "lifetime": "continuing", "directMembership": "no", "cardinality": "singleton"}, "equipment-team": {"scope": "choir", "lifetime": "fluid", "directMembership": "yes", "cardinality": "choir-singleton"}, "party-team": {"scope": "choir", "lifetime": "fluid", "directMembership": "yes", "cardinality": "choir-singleton"}, "rehearsal-weekend-team": {"scope": "choir", "lifetime": "fluid", "directMembership": "yes", "cardinality": "choir-singleton"}, "gig-group": {"scope": "csk", "lifetime": "fluid", "directMembership": "yes", "cardinality": "multiple"}, "other": {"scope": "csk", "lifetime": "fluid", "directMembership": "yes", "cardinality": "multiple"}}'::jsonb -> code
$$;
--> statement-breakpoint
CREATE FUNCTION organisation_position_policy(code text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"ordforande": {"label": "Ordförande", "context": "board", "prerequisite": false, "grants": ["board"], "endPolicy": "annual"}, "vice-ordforande": {"label": "Vice Ordförande", "context": "board", "prerequisite": false, "grants": ["board", "recruitment-committee"], "endPolicy": "annual"}, "kassor": {"label": "Kassör", "context": "board", "prerequisite": false, "grants": ["board"], "endPolicy": "annual"}, "sekreterare": {"label": "Sekreterare", "context": "board", "prerequisite": false, "grants": ["board", "parents-meeting"], "endPolicy": "annual"}, "pr-mastare": {"label": "PR-mästare", "context": "board", "prerequisite": false, "grants": ["board"], "endPolicy": "annual"}, "forsta-konsertmastare": {"label": "1:a Konsertmästare", "context": "board", "prerequisite": false, "grants": ["board", "concert-committee"], "endPolicy": "annual"}, "csk-gigmastare": {"label": "CSK Gigmästare", "context": "board", "prerequisite": false, "grants": ["board", "gig-committee"], "endPolicy": "annual"}, "sexmastare": {"label": "Sexmästare", "context": "board", "prerequisite": false, "grants": ["board", "social-committee"], "endPolicy": "annual"}, "sexmastarinna": {"label": "Sexmästarinna", "context": "social-committee", "prerequisite": false, "grants": ["social-committee"], "endPolicy": "annual"}, "ekonomiskt-ansvarig": {"label": "Ekonomiskt Ansvarig", "context": "tour-committee", "prerequisite": false, "grants": ["tour-committee"], "endPolicy": "annual"}, "dirigent": {"label": "Dirigent", "context": "choir", "prerequisite": true, "grants": [], "endPolicy": "fluid"}, "notfiskal": {"label": "Notfiskal", "context": "choir", "prerequisite": true, "grants": [], "endPolicy": "fluid"}, "choir-konsertmastare": {"label": "Choir Konsertmästare", "context": "choir", "prerequisite": true, "grants": ["concert-committee"], "endPolicy": "annual"}, "choir-gigmastare": {"label": "Choir Gigmästare", "context": "choir", "prerequisite": true, "grants": ["gig-committee"], "endPolicy": "annual"}, "stamforalder": {"label": "Stämförälder", "context": "section", "prerequisite": true, "grants": ["parents-meeting"], "endPolicy": "fluid"}, "gigledare": {"label": "Gigledare", "context": "gig-group", "prerequisite": true, "grants": [], "endPolicy": "fluid"}}'::jsonb -> code
$$;
--> statement-breakpoint
CREATE FUNCTION check_organisation_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy jsonb;
BEGIN
  policy := organisation_group_policy(NEW.type::text);
  IF (policy->>'lifetime' = 'annual') <> (NEW.organisation_year IS NOT NULL)
    OR (policy->>'scope' = 'choir') <> (NEW.choir_id IS NOT NULL) THEN
    RAISE check_violation USING CONSTRAINT = 'group_organisation_policy_check';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER organisation_group_policy_check BEFORE INSERT OR UPDATE ON "group"
  FOR EACH ROW EXECUTE FUNCTION check_organisation_group();
--> statement-breakpoint
CREATE FUNCTION check_position_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE context "group"; definition jsonb;
BEGIN
  SELECT * INTO context FROM "group" WHERE id = NEW.context_group_id;
  definition := organisation_position_policy(NEW.position_code);
  IF definition IS NULL OR definition->>'context' <> context.type::text THEN
    RAISE check_violation USING CONSTRAINT = 'position_appointment_policy_check';
  END IF;
  IF definition->>'endPolicy' = 'annual' THEN
    IF NEW.organisation_year IS NULL OR NEW.end_date IS NULL
      OR NEW.start_date < make_date(NEW.organisation_year, 7, 1)
      OR NEW.end_date > make_date(NEW.organisation_year + 1, 7, 1)
      OR (context.organisation_year IS NOT NULL AND context.organisation_year <> NEW.organisation_year) THEN
      RAISE check_violation USING CONSTRAINT = 'position_appointment_annual_check';
    END IF;
  ELSIF NEW.organisation_year IS NOT NULL THEN
    RAISE check_violation USING CONSTRAINT = 'position_appointment_annual_check';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER position_appointment_policy_check BEFORE INSERT OR UPDATE ON position_appointment
  FOR EACH ROW EXECUTE FUNCTION check_position_appointment();
--> statement-breakpoint
CREATE FUNCTION check_direct_membership() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF (target.type IN ('section', 'gig-group')) <> (NEW.voice IS NOT NULL) THEN
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
--> statement-breakpoint
CREATE TRIGGER direct_membership_policy_check BEFORE INSERT OR UPDATE ON direct_membership
  FOR EACH ROW EXECUTE FUNCTION check_direct_membership();
--> statement-breakpoint
