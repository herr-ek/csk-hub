CREATE TABLE "appointment_grant" (
	"appointment_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "appointment_grant_appointment_id_group_id_pk" PRIMARY KEY("appointment_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "direct_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"voice" "voice_division",
	CONSTRAINT "direct_membership_period_check" CHECK ("direct_membership"."end_date" IS NULL OR "direct_membership"."end_date" > "direct_membership"."start_date")
);
--> statement-breakpoint
CREATE TABLE "position_appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"position_code" text NOT NULL,
	"context_group_id" uuid NOT NULL,
	"organisation_year" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	CONSTRAINT "position_appointment_period_check" CHECK ("position_appointment"."end_date" IS NULL OR "position_appointment"."end_date" > "position_appointment"."start_date"),
	CONSTRAINT "position_appointment_year_check" CHECK ("position_appointment"."organisation_year" IS NULL OR "position_appointment"."organisation_year" BETWEEN 1000 AND 9998)
);
--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "organisation_year" integer;--> statement-breakpoint
ALTER TABLE "group" ADD COLUMN "uses_appointment_model" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment_grant" ADD CONSTRAINT "appointment_grant_appointment_id_position_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."position_appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_grant" ADD CONSTRAINT "appointment_grant_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_membership" ADD CONSTRAINT "direct_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_membership" ADD CONSTRAINT "direct_membership_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_appointment" ADD CONSTRAINT "position_appointment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_appointment" ADD CONSTRAINT "position_appointment_context_group_id_group_id_fk" FOREIGN KEY ("context_group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_grant_group_idx" ON "appointment_grant" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "direct_membership_group_idx" ON "direct_membership" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "position_appointment_user_idx" ON "position_appointment" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_annual_identity_unique" ON "group" USING btree ("type","organisation_year") WHERE "group"."uses_appointment_model" AND "group"."organisation_year" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "group_continuing_singleton_unique" ON "group" USING btree ("type") WHERE "group"."uses_appointment_model" AND "group"."type" = 'Föräldramötet';--> statement-breakpoint
CREATE UNIQUE INDEX "group_choir_team_unique" ON "group" USING btree ("type","choir_id") WHERE "group"."uses_appointment_model" AND "group"."active" AND "group"."type" IN ('Roddgrupp', 'Festgrupp', 'Rephelg');--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_organisation_year_check" CHECK ("group"."organisation_year" IS NULL OR "group"."organisation_year" BETWEEN 1000 AND 9998);--> statement-breakpoint
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
  SELECT '{"Choir": {"scope": "csk", "lifetime": "continuing", "directMembership": "yes", "cardinality": "existing-choirs"}, "Section": {"scope": "choir", "lifetime": "continuing", "directMembership": "placement", "cardinality": "four-sections"}, "Board": {"scope": "csk", "lifetime": "annual", "directMembership": "no", "cardinality": "singleton"}, "Gigmästeri": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "Sexmästeri": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "Konsertmästeri": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "Rekryteringskommitté": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "Turnékommitté": {"scope": "csk", "lifetime": "annual", "directMembership": "helpers", "cardinality": "singleton"}, "Valberedning": {"scope": "csk", "lifetime": "annual", "directMembership": "yes", "cardinality": "singleton"}, "Webmästeri": {"scope": "csk", "lifetime": "annual", "directMembership": "yes", "cardinality": "singleton"}, "Arkivarie": {"scope": "csk", "lifetime": "annual", "directMembership": "yes", "cardinality": "singleton"}, "Utantillkommitté": {"scope": "csk", "lifetime": "annual", "directMembership": "yes", "cardinality": "singleton"}, "Föräldramötet": {"scope": "csk", "lifetime": "continuing", "directMembership": "no", "cardinality": "singleton"}, "Roddgrupp": {"scope": "choir", "lifetime": "fluid", "directMembership": "yes", "cardinality": "choir-singleton"}, "Festgrupp": {"scope": "choir", "lifetime": "fluid", "directMembership": "yes", "cardinality": "choir-singleton"}, "Rephelg": {"scope": "choir", "lifetime": "fluid", "directMembership": "yes", "cardinality": "choir-singleton"}, "GigGroup": {"scope": "csk", "lifetime": "fluid", "directMembership": "yes", "cardinality": "multiple"}, "Övrig": {"scope": "csk", "lifetime": "fluid", "directMembership": "yes", "cardinality": "multiple"}}'::jsonb -> code
$$;
--> statement-breakpoint
CREATE FUNCTION organisation_position_policy(code text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"ordforande": {"label": "Ordförande", "context": "Board", "prerequisite": false, "grants": ["Board"], "endPolicy": "annual"}, "vice-ordforande": {"label": "Vice Ordförande", "context": "Board", "prerequisite": false, "grants": ["Board", "Rekryteringskommitté"], "endPolicy": "annual"}, "kassor": {"label": "Kassör", "context": "Board", "prerequisite": false, "grants": ["Board"], "endPolicy": "annual"}, "sekreterare": {"label": "Sekreterare", "context": "Board", "prerequisite": false, "grants": ["Board", "Föräldramötet"], "endPolicy": "annual"}, "pr-mastare": {"label": "PR-mästare", "context": "Board", "prerequisite": false, "grants": ["Board"], "endPolicy": "annual"}, "forsta-konsertmastare": {"label": "1:a Konsertmästare", "context": "Board", "prerequisite": false, "grants": ["Board", "Konsertmästeri"], "endPolicy": "annual"}, "csk-gigmastare": {"label": "CSK Gigmästare", "context": "Board", "prerequisite": false, "grants": ["Board", "Gigmästeri"], "endPolicy": "annual"}, "sexmastare": {"label": "Sexmästare", "context": "Board", "prerequisite": false, "grants": ["Board", "Sexmästeri"], "endPolicy": "annual"}, "sexmastarinna": {"label": "Sexmästarinna", "context": "Sexmästeri", "prerequisite": false, "grants": ["Sexmästeri"], "endPolicy": "annual"}, "ekonomiskt-ansvarig": {"label": "Ekonomiskt Ansvarig", "context": "Turnékommitté", "prerequisite": false, "grants": ["Turnékommitté"], "endPolicy": "annual"}, "dirigent": {"label": "Dirigent", "context": "Choir", "prerequisite": true, "grants": [], "endPolicy": "fluid"}, "notfiskal": {"label": "Notfiskal", "context": "Choir", "prerequisite": true, "grants": [], "endPolicy": "fluid"}, "choir-konsertmastare": {"label": "Choir Konsertmästare", "context": "Choir", "prerequisite": true, "grants": ["Konsertmästeri"], "endPolicy": "annual"}, "choir-gigmastare": {"label": "Choir Gigmästare", "context": "Choir", "prerequisite": true, "grants": ["Gigmästeri"], "endPolicy": "annual"}, "stamforalder": {"label": "Stämförälder", "context": "Section", "prerequisite": true, "grants": ["Föräldramötet"], "endPolicy": "fluid"}, "gigledare": {"label": "Gigledare", "context": "GigGroup", "prerequisite": true, "grants": [], "endPolicy": "fluid"}}'::jsonb -> code
$$;
--> statement-breakpoint
CREATE FUNCTION check_organisation_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy jsonb;
BEGIN
  IF NOT NEW.uses_appointment_model THEN RETURN NEW; END IF;
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
  IF (target.type = 'Section') <> (NEW.voice IS NOT NULL) THEN
    RAISE check_violation USING CONSTRAINT = 'direct_membership_voice_check';
  END IF;
  IF target.type = 'Section' THEN
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
CREATE FUNCTION check_appointment_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target "group"; appointment position_appointment; definition jsonb;
BEGIN
  SELECT * INTO target FROM "group" WHERE id = NEW.group_id;
  SELECT * INTO appointment FROM position_appointment WHERE id = NEW.appointment_id;
  definition := organisation_position_policy(appointment.position_code);
  IF NOT target.uses_appointment_model OR NOT (definition->'grants' ? target.type::text)
    OR (target.type::text = definition->>'context' AND target.id <> appointment.context_group_id)
    OR (organisation_group_policy(target.type::text)->>'lifetime' = 'annual'
      AND target.organisation_year IS DISTINCT FROM appointment.organisation_year) THEN
    RAISE check_violation USING CONSTRAINT = 'appointment_grant_policy_check';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER appointment_grant_policy_check BEFORE INSERT OR UPDATE ON appointment_grant
  FOR EACH ROW EXECUTE FUNCTION check_appointment_grant();
