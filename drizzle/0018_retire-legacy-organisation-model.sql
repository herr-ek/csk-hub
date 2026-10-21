ALTER TABLE "group_member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_type_position" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "position" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "position_group" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "position_holder" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS "group_member_voice_check" ON "group_member";--> statement-breakpoint
DROP FUNCTION IF EXISTS "group_member_voice_check"();--> statement-breakpoint
DROP TABLE "group_member" CASCADE;--> statement-breakpoint
DROP TABLE "group_type_position" CASCADE;--> statement-breakpoint
DROP TABLE "position" CASCADE;--> statement-breakpoint
DROP TABLE "position_group" CASCADE;--> statement-breakpoint
DROP TABLE "position_holder" CASCADE;--> statement-breakpoint
DROP INDEX "group_annual_identity_unique";--> statement-breakpoint
DROP INDEX "group_continuing_singleton_unique";--> statement-breakpoint
DROP INDEX "group_choir_team_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "group_annual_identity_unique" ON "group" USING btree ("type","organisation_year") WHERE "group"."organisation_year" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "group_continuing_singleton_unique" ON "group" USING btree ("type") WHERE "group"."type" = 'Föräldramötet';--> statement-breakpoint
CREATE UNIQUE INDEX "group_choir_team_unique" ON "group" USING btree ("type","choir_id") WHERE "group"."active" AND "group"."type" IN ('Roddgrupp', 'Festgrupp', 'Rephelg');--> statement-breakpoint
ALTER TABLE "group" DROP COLUMN "uses_appointment_model";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_organisation_group() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE OR REPLACE FUNCTION check_appointment_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target "group"; appointment position_appointment; definition jsonb;
BEGIN
  SELECT * INTO target FROM "group" WHERE id = NEW.group_id;
  SELECT * INTO appointment FROM position_appointment WHERE id = NEW.appointment_id;
  definition := organisation_position_policy(appointment.position_code);
  IF NOT (definition->'grants' ? target.type::text)
    OR (target.type::text = definition->>'context' AND target.id <> appointment.context_group_id)
    OR (organisation_group_policy(target.type::text)->>'lifetime' = 'annual'
      AND target.organisation_year IS DISTINCT FROM appointment.organisation_year) THEN
    RAISE check_violation USING CONSTRAINT = 'appointment_grant_policy_check';
  END IF;
  RETURN NEW;
END $$;
