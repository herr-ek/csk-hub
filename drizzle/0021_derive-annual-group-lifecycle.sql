-- Annual lifecycle is determined by organisation_year, including previously manually archived rows.
-- Keep every identity, membership and appointment unchanged.
UPDATE "group" SET "active" = true WHERE "organisation_year" IS NOT NULL AND NOT "active";
--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_annual_active_check" CHECK ("group"."organisation_year" IS NULL OR "group"."active");
