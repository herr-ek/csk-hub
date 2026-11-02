# User preferences

This module owns the application-wide user-preferences contract. It hides JSON storage, runtime validation,
backward-compatible reads, defaults, and atomic partial updates behind two server-only functions:

- `getUserPreferences(userId)` always returns a complete `UserPreferences` value. A missing row or missing fields in
  an older row receive defaults. Unknown fields written by a newer application version are ignored. Malformed JSON
  falls back to the complete default value instead of breaking a request.
- `updateUserPreferences(userId, update)` validates a partial update and merges it into the JSONB document in the
  database. It does not replace fields omitted by the caller, including fields an older application version does not
  know about. If the stored document is not a JSON object, the validated update replaces it so the write repairs the
  malformed value.

The server-only interface is exported from `index.ts`. `schema.ts` is intentionally universal so schemas and types can
be imported directly by code that does not need database access.

## Adding a preference

Keep compatibility with users whose rows predate the new field:

1. Add the field and its validator to `preferenceValuesSchema` in `schema.ts`.
2. Add a safe value for the field to `userPreferencesDefaults`. The `satisfies UserPreferences` check ensures the
   defaults remain complete as the schema grows.
3. Use `updateUserPreferences` for writes so other fields survive the update. Do not replace the JSON document from a
   feature action.
4. Extend `schema.test.ts` with the new field, its invalid values, and an old stored object that omits it.
5. Consumers should use the complete object returned by `getUserPreferences`; they should not add their own fallback
   for a missing field.

`userPreferencesSchema` merges partial stored data with the defaults for backward-compatible reads.
`userPreferencesUpdateSchema` is derived from the non-defaulted value schema, so an empty update remains empty instead
of writing default values over existing preferences.

The default `locale` is `null`, which means the member has not saved a locale preference. This leaves locale selection
to the current browser until the member saves a supported locale.

Adding an optional stored field without a read-time default would leak storage history into every caller. Prefer a
required field in `UserPreferences` plus a default at this module's seam. If a preference genuinely has an explicit
“unset” state, model that state in its schema rather than using a missing legacy field to represent it.
