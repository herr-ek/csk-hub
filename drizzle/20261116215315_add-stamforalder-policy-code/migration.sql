ALTER TABLE "position" ADD COLUMN "code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "position_code_unique" ON "position" ("code");--> statement-breakpoint
-- Bind the existing canonical catalogue entry once. Runtime authorization never matches labels.
UPDATE "position" SET "code" = 'stamforalder' WHERE "name" = 'Stämförälder' AND "code" IS NULL;
