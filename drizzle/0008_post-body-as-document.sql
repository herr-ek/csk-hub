-- The text nodes of a rich-text document, in reading order, for full-text search.
-- The ordinality is what makes "reading order" true rather than incidental: string_agg
-- without an ORDER BY may aggregate in any order, which a phrase search would notice.
-- IMMUTABLE so a generated column may call it; STRICT so a null body yields null.
-- Strict-mode jsonpath: in lax mode `.**` visits array elements twice.
CREATE FUNCTION post_body_text(body jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT string_agg(node #>> '{}', ' ' ORDER BY ord)
  FROM jsonb_array_elements(jsonb_path_query_array(body, 'strict $.**.text', '{}', true))
       WITH ORDINALITY AS nodes(node, ord)
$$;--> statement-breakpoint
-- What the textarea stored becomes a document of one paragraph per line, so no
-- published Post loses a word. Dropped again once the column has been converted.
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
DROP FUNCTION post_text_to_document(text);--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "body_search" "tsvector" GENERATED ALWAYS AS (to_tsvector('swedish', coalesce(post_body_text("body"), ''))) STORED;--> statement-breakpoint
CREATE INDEX "post_body_search_idx" ON "post" USING gin ("body_search");
