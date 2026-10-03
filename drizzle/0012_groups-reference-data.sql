-- Reference data every environment shares: the three Choirs with their four Sections and the
-- Voices each sings, the Board, and the Position catalogue. Mirrors `REFERENCE_DATA` in
-- src/features/groups/reference-data.ts, which the tests check against this migration.
INSERT INTO "group" ("name", "type") VALUES ('MK', 'Choir'), ('DK', 'Choir'), ('KK', 'Choir');--> statement-breakpoint
INSERT INTO "choir" ("group_id")
SELECT "id" FROM "group" WHERE "type" = 'Choir' AND "name" IN ('MK', 'DK', 'KK');--> statement-breakpoint
INSERT INTO "group" ("name", "type", "choir_id")
SELECT s."name", 'Section', c."id"
FROM (VALUES
	('MK', 'MKT1'), ('MK', 'MKT2'), ('MK', 'MKB1'), ('MK', 'MKB2'),
	('DK', 'DKS1'), ('DK', 'DKS2'), ('DK', 'DKA1'), ('DK', 'DKA2'),
	('KK', 'KKS'), ('KK', 'KKA'), ('KK', 'KKT'), ('KK', 'KKB')
) AS s("choir", "name")
JOIN "group" c ON c."name" = s."choir" AND c."type" = 'Choir';--> statement-breakpoint
INSERT INTO "section_voice" ("section_id", "voice")
SELECT g."id", v."voice"::"voice"
FROM (VALUES
	('MKT1', 'T1'), ('MKT2', 'T2'), ('MKB1', 'B1'), ('MKB2', 'B2'),
	('DKS1', 'S1'), ('DKS2', 'S2'), ('DKA1', 'A1'), ('DKA2', 'A2'),
	('KKS', 'S1'), ('KKS', 'S2'), ('KKA', 'A1'), ('KKA', 'A2'),
	('KKT', 'T1'), ('KKT', 'T2'), ('KKB', 'B1'), ('KKB', 'B2')
) AS v("section", "voice")
JOIN "group" g ON g."name" = v."section" AND g."type" = 'Section';--> statement-breakpoint
INSERT INTO "group" ("name", "type") VALUES ('Styret', 'Board');--> statement-breakpoint
INSERT INTO "position" ("name") VALUES
	('Ordförande'), ('PR-mästare'), ('Gigmästare'), ('Sexmästare'), ('Sexmästarinna'),
	('Conductor'), ('Notfiskal'), ('Konsertmästare'), ('Stämförälder');--> statement-breakpoint
INSERT INTO "group_type_position" ("type", "position_id")
SELECT a."type"::"group_type", p."id"
FROM (VALUES
	('Board', 'Ordförande'), ('Board', 'PR-mästare'), ('Board', 'Gigmästare'),
	('Gigmästeri', 'Gigmästare'), ('Board', 'Sexmästare'), ('Sexmästeri', 'Sexmästare'),
	('Board', 'Sexmästarinna'), ('Sexmästeri', 'Sexmästarinna'),
	('Choir', 'Conductor'), ('Choir', 'Notfiskal'), ('Choir', 'Konsertmästare'),
	('Section', 'Stämförälder')
) AS a("type", "position")
JOIN "position" p ON p."name" = a."position";
