ALTER TABLE "group" DROP CONSTRAINT "group_name_not_blank_check";--> statement-breakpoint
DROP INDEX "group_name_choir_active_unique";--> statement-breakpoint
ALTER TABLE "group" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
-- Discard redundant labels for fixed identities; preserve all explicit names and IDs.
UPDATE "group" SET "name" = NULL WHERE "type" NOT IN ('Choir', 'Section', 'GigGroup', 'Övrig');
--> statement-breakpoint
-- Hand-written: retain NULLS NOT DISTINCT for the CSK-wide name namespace.
CREATE UNIQUE INDEX "group_name_choir_active_unique" ON "group" USING btree ("name","choir_id") NULLS NOT DISTINCT WHERE "group"."active" AND "group"."name" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_name_policy_check" CHECK (
      CASE WHEN "group"."type" IN ('Choir', 'Section', 'GigGroup', 'Övrig')
        THEN "group"."name" IS NOT NULL AND length(btrim("group"."name")) > 0
        ELSE "group"."name" IS NULL END
    );