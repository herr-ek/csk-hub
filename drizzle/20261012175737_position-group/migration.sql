CREATE TABLE "position_group" (
	"position_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "position_group_position_id_group_id_pk" PRIMARY KEY("position_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "position_group" ADD CONSTRAINT "position_group_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_group" ADD CONSTRAINT "position_group_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "position_group_groupId_idx" ON "position_group" USING btree ("group_id");--> statement-breakpoint
-- Added by hand: DelkörsGigmästare is replaced by one Gigmästare per Choir (Gigmästare KK and so
-- on), each limited to its Choir and the Gigmästeri; `bun run ops reference-data` creates them. It
-- is removed only where nobody has ever held it. Where someone has, it stays, so their history
-- keeps its name.
DELETE FROM "group_type_position" WHERE "position_id" IN (
	SELECT p."id" FROM "position" p
	WHERE p."name" = 'DelkörsGigmästare'
		AND NOT EXISTS (SELECT 1 FROM "position_holder" h WHERE h."position_id" = p."id")
);--> statement-breakpoint
DELETE FROM "position" p
WHERE p."name" = 'DelkörsGigmästare'
	AND NOT EXISTS (SELECT 1 FROM "position_holder" h WHERE h."position_id" = p."id");
