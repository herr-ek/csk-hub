-- Custom migration (drizzle-kit generate --custom): converting a text column to jsonb needs
-- a USING clause, which drizzle-kit does not generate. What the textarea stored becomes a
-- document of one paragraph per line, so no published Post loses a word. A USING clause
-- cannot hold a subquery, hence the helper, dropped again once the column is converted.
CREATE FUNCTION post_text_to_document(body text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'type', 'doc',
    'content', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', line))
          )
          ORDER BY ordinality
        )
        FROM regexp_split_to_table(body, E'\r?\n') WITH ORDINALITY AS lines(line, ordinality)
        WHERE btrim(line) <> ''
      ),
      jsonb_build_array(jsonb_build_object('type', 'paragraph'))
    )
  )
$$;--> statement-breakpoint
ALTER TABLE "post" ALTER COLUMN "body" SET DATA TYPE jsonb USING post_text_to_document("body");--> statement-breakpoint
DROP FUNCTION post_text_to_document(text);
