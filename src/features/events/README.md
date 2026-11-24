# Events

The CSK calendar: Events, who they are for, and where they are held. Terminology lives in
[`GLOSSARY.md`](../../../GLOSSARY.md#events); the scheme it implements is "Events scheme (v2)"
in `docs/schemas/Events - DB Scheme.md`, which tags every rule with where it is enforced.
This module covers what an organiser writes: the Event, its extension row, Targets, Event
details and Locations, what each User reads: their upcoming Events and each Event page, and the
Audience's Responses with the Absence reasons they give. Registrations and Attendance come later.

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
- Only the Event's Audience responds, through `inAudience`, and only before the Event starts;
  after that, what happened is Attendance. A Response is replaced, never removed, and every
  change sets `respondedAt`. One after `respondBy` is accepted and late.
- In `ResponseRequired` a reason with No is optional; only an active Absence reason can be
  picked, except the archived one the User's Response already gives. Absence reasons are archived,
  never deleted.

The database enforces the rest, and the module reports it as a violation like its own rules: the
CHECKs on times and the respond-by deadline, the `event_participation_mode_change_check`
trigger, which refuses a mode that would strand Responses or Registrations, the
`event_response_check` trigger, which takes Responses only to a Published Event in a response
mode and in the strict mode only Yes, or No with a reason, the one-reason-only-with-No CHECKs,
and the unique Target, active Location name and active Absence reason label. The module checks
its own rules first, so a violation names the rule (`maybe-not-allowed` rather than the
trigger's `absence-reason-required`); the mapping catches only races. Deleting an Event never fails for what is recorded on it; the
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
- Rehearsal series: `createRehearsalSeries`, one Series of Draft Rehearsals for a whole Choir on
  the given dates, all or nothing and at most `MAX_SERIES_DATES`; `setEventLocation` changes only
  an Event's Location. `weeklyDates` in the model lists a weekday's dates for the preview.
- Locations: `createLocation`, `updateLocation`, `archiveLocation`.
- Responses: `respondToEvent`, which takes the responding User and returns whether the answer was
  late. Absence reasons: `createAbsenceReason`, `renameAbsenceReason`, `archiveAbsenceReason`.

**Commands check no permissions.** Callers must establish authority before invoking them. The
Audience check of `respondToEvent` is a rule of the Event, not a permission: the caller still
establishes active identity.
The UI requires fresh `event.*` authority at each protected read and command.
Admin and current Position appointment holders of the exact active non-Choir organiser Group may
manage Events in every lifecycle state. Updates check current and proposed organisers.
Creator identity and Targets do not grant management. Missing/archived organisers and Choirs
remain Admin-only, with one exception: `event.scheduleRehearsals` (Admin, or a current Position
holder in an active Board group) manages a Rehearsal in a Series whose only Target is one whole
Choir, and its updates must keep it one under the same organiser; see
[the exception](../../../docs/authorization.md#exception-the-board-schedules-choirs-series-rehearsals). Shared Location management
uses Admin-only `event.administer`.
Delegated form options contain User names and IDs without emails; Admin retains emails.
`group.manageEvents` alone does not authorize an Event ID. See [authorization](../../../docs/authorization.md#events-implemented-boundaries-and-policy-gaps).

## The Audience

Who an Event is for is computed, never stored: `inAudience` in `audience.ts` is the scheme's
"Targets and audience" pseudo-code as a pure function of a User's dated Memberships and an Event's
Targets. Only Memberships active on the Event's start date in Europe/Stockholm count, so a singer
who has left stops seeing later Events and a new one sees Events from their first day. Appointment grants count as effective Memberships; permission roles play no part. The Memberships come from org-structure's
`listMembershipsOfUser`, since that module is the only reader of its tables. Responses check their
Audience through the same function, and so must Registrations. Who has not answered needs the
Audience as a list: `listActiveAudience` in `responses.ts` applies `inAudience` to every User
with a Membership in a Target's groups that day (org-structure's `listMembershipsOnDate`), or to
every User for an Event without Targets, and leaves Inactive Users out.

A Rehearsal is labelled by its kind (`rehearsalKind` in the model), derived from its Targets and
Series as the scheme describes: Choir rehearsal, Extra rehearsal, Sectional rehearsal or Rehearsal.

## Calendar pages

`/events` lists the signed-in User's upcoming Events, and `/events/[eventId]` is an Event page.
Both live in `calendar/`, with their reads in `calendar/query.ts`:

- Only Published and Cancelled Events are shown, and only to their Audience; a Cancelled Event
  stays, struck through. An Event is upcoming until it has ended, so ongoing ones still show.
- An Event page the viewer may not see answers exactly like a missing one: a Draft for everyone,
  Admins included (they have the admin page), and any other Event outside the viewer's Audience
  unless they are an Admin or current Event manager.
- A Gig's external contact is personal data for organisers only. The calendar reads never select
  it.
- `/events?type=Gig` narrows the list to one type, after the Audience is computed. The filter only
  offers types the User has coming up, and only appears when there is more than one.
- A Published Event in a response mode shows the User's own answer in the list, or that they have
  not answered and by when, highlighted once the deadline has passed. At the top of its page the
  Audience answers (`ResponseBar`, `calendar/actions.ts`): Yes is saved in one tap, No opens a
  dialog for the reason. A card at the bottom shows who answered what and how many have not, by
  name only: the page reads no one's comment or reason but the viewer's own. On a Rehearsal only
  the viewers who may manage it (`event.read`) get that card; the read leaves the names out for
  everyone else.

## Admin pages

`/events/manage` lists the Events the viewer may manage, `/events/manage/new` creates one, and
`/events/manage/[eventId]` edits it and moves it through its lifecycle; for Admins it also lists
every Response with its reason, comment and late flag, and who has not answered. The Admin pages
remain available; `/admin/events/locations` keeps the shared Locations and
`/admin/events/absence-reasons` the Absence reasons.
The entrypoint exports their screens; everything else lives in `ui/`:

```text
ui/
  list/        the Event list, its filters in the address, and the audience summary
  editor/      the Event form, its Server Actions, and an Event's lifecycle
  locations/   the Location catalogue
  absence-reasons/   the Absence reason catalogue
  responses/   an Event's Responses on its admin page
  run-command.ts, EventCommandDialog.tsx   the shared shape of every admin command
  errors.ts    the field each violation is shown next to
```

Every Server Action goes through `runEventsCommand`: establish active identity (or
`event.administer` for Locations and Absence reasons), validate the form, check the exact Event policy with trusted
facts and locks in the command's transaction, run one module command, and return its violation as `{ status: "error", error }`. The client translates
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

## Agreed audience and participation access

The registered `event.view` policy and calendar list/detail share the same audience calculation.
For multi-day Events too, Membership is evaluated at Event start. Before start, Memberships whose exclusive end has passed stop granting access; scheduled
ends remain effective until that boundary. From start onward, historical Membership preserves
viewing after departure. Membership dates use exclusive end boundaries and Stockholm calendar-day precision.

Responding takes active identity and the Audience rule above. The full Response view, with
comments and reasons, is Admin-only (`event.administer`) for now; current Event managers get it
with delegated management. Registration and Attendance policies and operations are deferred until
those workflows exist. The agreed privacy and Section-parent scope remain future-work requirements in the
[authorization guide](../../../docs/authorization.md#deferred-participation-workflows). Position authority uses the fixed catalogue and contextual appointments.
