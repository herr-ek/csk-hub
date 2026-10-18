# Events

The CSK calendar: Events, who they are for, and where they are held. Terminology lives in
[`GLOSSARY.md`](../../../GLOSSARY.md#events); the scheme it implements is "Events scheme (v2)"
in `docs/schemas/Events - DB Scheme.md`, which tags every rule with where it is enforced.
This module covers what an organiser writes: the Event, its extension row, Targets, Event
details and Locations. Responses, Registrations and Attendance come later.

## The write path

Application code writes the tables in `src/core/db/schema/events.ts` only through this module.
This is a convention, not a test. `bun run ops seed-events` is the deliberate exception: it writes
the tables directly, so that scripts never depend on a feature, and keeps these rules by hand.

The rules below are tagged [app] in the scheme. They are not database constraints, so going
around this module breaks them silently:

- An extension row exists exactly when the type has one: a Rehearsal has a `rehearsal` row, a
  Gig a `gig` row and a Social a `social_event` row; the other types have none. Changing the type
  replaces the row and drops the old type's fields.
- A new Event is a Draft. Draft → Published → Cancelled, and a Cancelled Event can be reinstated
  (Published). A Published Event never returns to Draft.
- Without a Participation mode, an Event takes its type's default (`DEFAULT_PARTICIPATION_MODE`).
- An all-day Event runs from 00:00 on its first day to 00:00 on the day after its last, in
  Europe/Stockholm. The command takes the two calendar dates, never timestamps.
- A Location, Organiser group or Target group must be active when it is chosen. One the Event
  already has stays when it is archived later, so editing an old Event never forces a change.
- The description is parsed through the Events document schema (`event-document.ts`: emphasis,
  lists and links), never the Posts one, and a document with nothing to read is stored as null.
  Words the schema cannot hold are refused (`description-invalid`), not dropped; see
  [`rich-text`](../rich-text/README.md) and
  [ADR-0005](../../../docs/adr/0005-post-content-is-stored-as-the-editor-document.md).
- Event details keep the order they are given in, and each has a label and a value.
- A Location's map link is a web address, since it is shown as a link. Locations are archived,
  never deleted.

The database enforces the rest, and the module reports it as a violation like its own rules: the
CHECKs on times and the respond-by deadline, the `event_participation_mode_change_check`
trigger, which refuses a mode that would strand Responses or Registrations, and the unique
Target and active Location name. Deleting an Event never fails for what is recorded on it; the
caller warns first.

## Interface

`@/features/events` is server-only. `@/features/events/model` is universal: the Event types,
`DEFAULT_PARTICIPATION_MODE`, `statusChangesFrom`, the Stockholm time helpers and the result
types.

Every command takes the database client or a transaction as its first argument, so a caller
can make it one step of a larger transaction; a refused command rolls back only its own
savepoint. Commands return `{ success: true, data }` or `{ success: false, error }`, where
`error` is an `EventViolation`. Rule violations, including constraint and trigger violations,
never surface as thrown errors.

- Events: `createEvent` (takes the acting User as `createdBy`), `updateEvent`, which saves the
  whole form as one change, `changeEventStatus`, `deleteEvent`, and `getEventDeletionImpact`,
  which counts the Responses, Registrations and Attendance a delete removes.
- Locations: `createLocation`, `updateLocation`, `archiveLocation`.

**Commands check no permissions.** The Admin surface calls `requireAdmin()` in every Server
Action. Delegated Event management (Organiser group Position holders, Choir Positions) is meant to
put its own policy in front of these same commands.

## Admin pages

`/admin/events` lists every Event, `/admin/events/new` creates one, `/admin/events/[eventId]`
edits it and moves it through its lifecycle, and `/admin/events/locations` keeps the Locations.
The entrypoint exports their screens; everything else lives in `ui/`:

```text
ui/
  list/        the Event list, its filters in the address, and the audience summary
  editor/      the Event form, its Server Actions, and an Event's lifecycle
  locations/   the Location catalogue
  run-command.ts, CommandDialog.tsx   the shared shape of every admin command
  errors.ts    the field each violation is shown next to
```

Every Server Action goes through `runEventsCommand`: `requireAdmin`, validate the form, run one
module command, and return its violation as `{ status: "error", error }`. The client translates
the kind from `Events.errors` and shows it beside the field `ERROR_FIELD` names, so adding an
`EventViolation` means adding its message to every catalogue and its field to `ERROR_FIELD`; the
typecheck fails until you do. Reads for a screen live beside it (`query.ts`) and are shaped for
that screen.

## Tests

The tests run against a real, freshly migrated database created beside the local one in
`POSTGRES_URL` and dropped afterwards (`test/database.ts`). Without a reachable local Postgres
they are skipped with a warning. `test-support.ts` writes the groups the tests name directly,
since this feature reaches org-structure only through its entrypoint. `schema.test.ts` tests the
database's own constraints by writing the tables directly.
