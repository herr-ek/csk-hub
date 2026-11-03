ALTER TABLE "group" DROP CONSTRAINT "group_name_policy_check";
--> statement-breakpoint
-- Preserve Section identities and all participation; only their redundant names are removed.
UPDATE "group" SET "name" = NULL WHERE "type" = 'Section';
--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_name_policy_check" CHECK (
  CASE WHEN "type" IN ('Choir', 'GigGroup', 'Övrig')
    THEN "name" IS NOT NULL AND length(btrim("name")) > 0
    ELSE "name" IS NULL END
);
