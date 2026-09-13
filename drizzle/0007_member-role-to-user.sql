UPDATE "user"
SET "role" = array_to_string(array_replace(string_to_array("role", ','), 'member', 'user'), ',')
WHERE 'member' = ANY(string_to_array("role", ','));
