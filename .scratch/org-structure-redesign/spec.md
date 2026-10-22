# Positions and Groups Redesign

## Execution override — disposable local database (2026-10-21)

The user explicitly directed that the configured local database is disposable, existing data does not need conversion, and implementation must reset the database and seed the redesigned organisation. This instruction supersedes the legacy inventory, explicit resolution, conversion/audit, preserved-data migration fixtures, and operator staging requirements elsewhere in this original spec. Do not ship a reconciliation subsystem for this local reset. Retain committed migration history, add the final schema migration, and verify migration from empty plus rich fresh seeds. Preserve the domain rules, application editing flows, authorization, translations, seed idempotency, review, and runtime checks. Reset and reseed the configured local database after the final schema and seeds are ready; production reset, deployment, publication, and merging to master remain outside scope.

**Status:** approved for implementation — executing remaining tickets 03–08 (2026-10-21).
**Tracker:** local Markdown only, by explicit user instruction.
**Date:** 2026-10-20

## Problem Statement

The current organisation model identifies a Position holding by its User, Group, Position title, and dates. It cannot express one appointment that brings a person into several Groups. Konsertmästeriet consequently allows only one ordinary Konsertmästare, rather than one representative from each Choir alongside the 1:a Konsertmästare. Helper commands create separate holdings but do not persist their shared identity; subsequent handovers and Membership changes can leave them inconsistent.

Annual Groups are currently distinguished only by names. Current reads equate a null end date with current participation, which cannot correctly represent annual expiration or prepared future appointments. An editable Position catalogue and demo-only titles also make it possible to invent responsibilities that the organisation does not recognise.

Membership has several legitimate meanings: a Board member belongs through a Position; a Helper is explicitly added; a singer belongs independently of a temporary responsibility. These need one coherent public interface without treating them as interchangeable stored records.

## Solution

Use fixed Group type and Position catalogues, explicit organisational years for annual Groups, direct Membership records, and one record per Position appointment. An appointment references its particular context and grants Membership in the concrete Groups required by its Position. Those Memberships are derived from the fixed Position catalogue, context, and year, using the appointment's dates and lifecycle; no grant connections are stored.

Choir, Section, and gig-group leadership appointments require existing Membership and preserve it. Annual appointments end on 30 June and renew only through explicit new appointments. Fluid appointments continue until explicitly changed. All member lists, profiles, and dated Membership reads use the same combination of direct Memberships and appointment-granted participation.

## User Stories

1. As an Admin, I want Konsertmästeriet to contain the 1:a Konsertmästare and every Choir's Konsertmästare, so that all representatives are modelled accurately.
2. As a member, I want a representative's Choir or Section to appear with their Position, so that identical titles remain distinguishable.
3. As an Admin, I want one Sexmästare appointment to place its holder in both the appropriate Board and Sexmästeri, so that I manage one responsibility.
4. As an Admin, I want a handover to replace participation in every affected Group atomically, so that a predecessor cannot remain assigned elsewhere.
5. As an Admin, I want Positions to be vacant, so that incomplete staffing does not require placeholder people.
6. As an Admin, I want to fill a vacancy during the year, so that a September appointee belongs to the same annual Board as July appointees.
7. As an Admin, I want Board 26/27 and Board 27/28 to be different Groups, so that their people and history remain distinct.
8. As an Admin, I want to prepare next year's Groups and appointments in advance, so that planning does not change today's Board.
9. As a member, I want annual participation to end after 30 June, so that an unattended rollover does not silently renew me.
10. As an Admin, I want renewal to be explicit even when a person continues, so that each annual appointment records the actual decision.
11. As an Admin, I want one Position per person on the same Board, so that the elected-post rule is enforced.
12. As an Admin, I want multiple independent appointments outside that Board restriction, so that one person can fulfil several responsibilities.
13. As a member, I want to appear once in a Group reached through multiple appointments, so that its roster has no duplicate people.
14. As a member, I want all my Positions shown even when my Membership is deduplicated, so that my responsibilities remain visible.
15. As an Admin, I want to add Helpers directly to Groups that permit them, so that participation does not require an invented Position.
16. As an Admin, I want taking a committee Position to replace that person's Helper Membership in the affected Group, so that they are not both a Helper and a Position holder.
17. As an Admin, I want ending a Position to leave its former holder outside that committee unless I explicitly add them as a Helper, so that former Helpers are not silently restored.
18. As an Admin, I want direct additions to the Board refused, so that every Board member has a formal Position.
19. As an Admin, I want to manage Arkivariet and Webmästeriet through explicit annual Memberships only, so that those Groups have no invented formal titles.
20. As an Admin, I want to manage Valberedningen and Utantillkommittén through explicit annual Memberships only, so that their rosters reflect actual decisions.
21. As an Admin, I want a choir-scoped appointment to require existing Membership in that Choir, so that appointing a representative never enrols someone.
22. As a singer, I want my Choir Membership to survive taking or leaving a choir Position, so that singing and responsibility remain independent.
23. As an Admin, I want each Choir's Konsertmästare and Gigmästare appointment to end in June, so that next year's representatives require renewal.
24. As an Admin, I want Dirigent and Notfiskal appointments to remain fluid, so that they are not forced into annual renewal.
25. As a singer, I want my Section Membership and Voice preserved when I take or leave Stämförälder, so that responsibility does not alter placement.
26. As an Admin, I want Stämförälder appointments to remain fluid, so that their changes do not depend on the organisational year.
27. As an Admin, I want Föräldramötet to contain every current Stämförälder and the current Sekreterare, so that its roster follows the actual responsibilities.
28. As an Admin, I want an annual Sekreterare appointment to grant Membership only in its own Board and in the continuing Föräldramötet, so that it never grants another year's Board Membership.
29. As an Admin, I want a Gigledare appointment to require existing Membership in its gig group, so that leadership does not enrol a singer.
30. As a gig-group member, I want my Membership preserved when I stop being Gigledare, so that handing over leadership does not remove me.
31. As an Admin, I want leaving a prerequisite Group refused while a Position depends on it, so that a departure never silently disposes of an appointment.
32. As an Admin, I want a Section transfer to require explicit handling of a Stämförälder appointment, so that placement changes cannot bypass that protection.
33. As an Admin, I want Voice changes within the same Section to preserve Stämförälder, so that a musical change does not end an unrelated responsibility.
34. As an Admin, I want CSK-wide appointees to be eligible without any Choir Membership, so that organisational appointments do not impose an inaccurate singer requirement.
35. As an Admin, I want one continuing roddgrupp, festgrupp, and rephelgsgrupp per Choir at a time, so that fluid teams retain clear identities.
36. As an Admin, I want several CSK-wide gig groups with fluid Memberships, so that gig ensembles can be managed independently.
37. As an Admin, I want Position and Group type rules defined in code, so that rare organisational changes receive a deliberate code change.
38. As an Admin, I want form options and error messages to reflect the fixed rules, so that I can understand why an assignment or departure is refused.
39. As a member, I want current and historical profile information to reflect actual participation dates, so that future and expired appointments are presented correctly.
40. As a consumer of the organisation module, I want one dated Membership interpretation, so that appointment-granted members are not omitted from Group targeting.
41. As a maintainer, I want legacy holdings reconciled with explicit context and year evidence, so that independent appointments are not accidentally merged.
42. As a maintainer, I want uncertain legacy records reported before conversion, so that migration never invents appointments or discards history.
43. As a developer, I want realistic reference and demo data, so that the running application demonstrates the agreed domain rather than seed-only responsibilities.
44. As an Admin, I want concurrent changes to obey the same rules as sequential changes, so that simultaneous handovers cannot create multiple holders.
45. As an Admin, I want a refused command to leave every affected Group unchanged, so that a partial write cannot corrupt the organisation.
46. As a member using English, Swedish, or German, I want Position labels, year labels, explanations, and violations translated, so that the redesigned flows remain usable.
47. As an Admin, I want to edit a concrete Group's name, fixed type, applicable scope, and organisational year, so that I can correct its setup through the application.
48. As an Admin, I want to edit direct Memberships and correct their dates or singer placement, including historical and prepared future records, so that mistakes do not require database access.
49. As an Admin, I want to edit an existing appointment's holder, applicable Position, context, and dates, so that corrections update every affected Group consistently.
50. As an Admin, I want to amend or cancel prepared appointments and correct historical records explicitly, so that my management tools cover more than initial assignment and ending.
51. As an Admin, I want current, future, and historical records to be discoverable in the management UI, with access to their editing flows from relevant Group and member views, so that I can manage all organisational participation through the application.

## Implementation Decisions

### Fixed Group catalogue

An Organisational year is 1 July through 30 June; 26/27 starts in 2026. Every annual Group is a separate concrete Group. The Group type connects its meaning to other years without a continuing parent entity.

| Group type or family | Organisational scope | Lifetime | Direct Membership | Cardinality |
| --- | --- | --- | --- | --- |
| Choir | A Choir is itself a CSK-wide Group | Continuing | Yes | Existing MK, DK, KK |
| Section | One Choir | Continuing | Singer placement | Four non-overlapping Sections per Choir |
| Board | CSK-wide | Annual | No | One per year |
| Gigmästeri | CSK-wide | Annual | Helpers allowed | One per year |
| Sexmästeri | CSK-wide | Annual | Helpers allowed | One per year |
| Konsertmästeri | CSK-wide | Annual | Helpers allowed | One per year |
| Rekryteringskommitté | CSK-wide | Annual | Helpers allowed | One per year |
| Turnékommitté | CSK-wide | Annual | Helpers allowed | One per year; only one operates at a time |
| Valberedning | CSK-wide | Annual | Yes; no Positions | One per year |
| Webmästeri | CSK-wide | Annual | Yes; no Positions | One per year |
| Arkivariet | CSK-wide | Annual | Yes; no Positions | One per year |
| Utantillkommitté | CSK-wide | Annual | Yes; no Positions | One per year |
| Föräldramötet | CSK-wide | Continuing | No | One continuing Group |
| Roddgrupp, Festgrupp, Rephelg | One Choir | Fluid | Yes; no Positions | At most one current Group of each type per Choir |
| GigGroup | CSK-wide | Fluid | Yes | Multiple Groups |

Preserve the existing generic Övrig type as a compatibility case for explicitly added members, without inventing formal Positions or applying annual renewal. Existing unclassified Groups require explicit reconciliation; the generic type cannot be used to bypass the rules for a known formal Group type. Existing stable Group type identifiers need not be renamed merely to correct display labels.

### Fixed Position catalogue

A Position has a stable code independent of its translated display name. Organisational scope and appointment context are separate concepts: an annual Turnékommitté has its own Ekonomiskt Ansvarig even though the responsibility is CSK-wide.

| Position | Appointment context | Existing Membership required | Membership granted | End policy |
| --- | --- | --- | --- | --- |
| Ordförande | Concrete Board | None | That Board | 30 June |
| Vice Ordförande | Concrete Board | None | That Board and year's Rekryteringskommitté | 30 June |
| Kassör | Concrete Board | None | That Board | 30 June |
| Sekreterare | Concrete Board | None | That Board and fluid Föräldramötet | 30 June |
| PR-mästare | Concrete Board | None | That Board | 30 June |
| 1:a Konsertmästare | Concrete Board | None | That Board and year's Konsertmästeri | 30 June |
| CSK Gigmästare | Concrete Board | None | That Board and year's Gigmästeri | 30 June |
| Sexmästare | Concrete Board | None | That Board and year's Sexmästeri | 30 June |
| Sexmästarinna | Concrete Sexmästeri | None | That Sexmästeri | 30 June |
| Ekonomiskt Ansvarig | Concrete Turnékommitté | None | That Turnékommitté | 30 June |
| Dirigent | One Choir | That Choir | None | Fluid |
| Notfiskal | One Choir | That Choir | None | Fluid |
| Choir Konsertmästare | One Choir | That Choir | Year's Konsertmästeri | 30 June |
| Choir Gigmästare | One Choir | That Choir | Year's Gigmästeri | 30 June |
| Stämförälder | One Section | That Section | Fluid Föräldramötet | Fluid |
| Gigledare | One gig group | That gig group | None | Fluid |

Use one Choir Gigmästare definition with a context Choir rather than separate definitions named MK, DK, and KK. Keep CSK Gigmästare distinct from Choir Gigmästare. Remove demo-only titles such as Webbansvarig, Arkivansvarig, Roddansvarig, Festansvarig, Rephelgsansvarig, Sammankallande, and Utantillansvarig unless a later domain decision adds them. Gigledare was explicitly retained during this interview.

### Representation and module boundary

- Keep the organisation module as the sole application owner of Group and Position writes and reads. Preserve its server-only command/read boundary, universal domain types, explicit database-or-transaction inputs, and typed rule-violation results.
- Give annual Groups an explicit year identity rather than inferring operational identity from their editable names.
- Store direct Memberships independently, retaining Voice data only on Section Memberships and preserving existing Choir/Section placement constraints.
- Store one Position appointment with a User, stable Position type, concrete context Group, and tenure.
- Remove the old editable Position table at final cutover. The fixed catalogue lives in code; appointments persist its stable Position code rather than depending on a retained dynamic Position definition.
- Derive every concrete Group in which an appointment grants Membership from the fixed catalogue, context, and explicit year. Store only the appointment. The current catalogue applies to historical, current, and future appointments; no grant rows or policy snapshots are maintained.
- The context Group does not itself imply Membership. It may be an eligibility prerequisite or a granted Group according to the catalogue.
- Evaluate effective Membership as the union of dated direct Membership and dated appointment grants, deduplicating people for roster reads while retaining every Position and context.
- Expose current and dated reads through the same public interpretation. Consumers do not reconstruct grants or query organisation tables directly.
- Keep member profiles and directory summaries on this public boundary. Adapt any existing dated consumer, including Event audiences, if it is present at implementation time; new Events screens and audience policies are not part of this work.

### Dates, identity, and lifecycle

- Use calendar dates with an inclusive start and exclusive end in storage. A last day of 30 June is stored with an exclusive end of 1 July and displayed as 30 June. Adapt existing form contracts deliberately so historical dates are not shifted accidentally.
- Current means the evaluated date is within the period, not simply that an end is null. Prepared future Groups and appointments do not become current early; an expired annual Group remains available historically.
- Every annual Membership and appointment is bounded by its Organisational year. The intended year remains explicit when someone joins late.
- A Choir's annual Konsertmästare appointment ends itself in June. Joining next year's Konsertmästeri follows an explicitly renewed appointment, not a separate renewal of its grant.
- Appoint, end, replace, and renew the entire appointment atomically. Handover closes the predecessor and opens the successor without a gap or overlap when they share the same boundary.
- Board Membership is entirely appointment-granted. Each person has at most one simultaneous Position on the same Board, but may hold independent Positions elsewhere.
- Helpers are direct members without a Position in that committee. When an appointment grants Membership there, close the overlapping Helper Membership in the same transaction. Preserve prior history and unrelated Memberships.
- Ending an appointment does not resurrect a Helper Membership. An Admin may explicitly add the former holder as a Helper in an eligible Group.
- Required Choir, Section, and gig-group Memberships remain independent when their appointments start or end. Appointments must be covered by the required Membership periods, including future appointments.
- Refuse ending or shortening a prerequisite Membership, or transferring away from a Section, while a dependent appointment would remain. A Choir departure also checks dependent Section appointments. A Voice change inside the same Section preserves the appointment.
- Annual Groups follow their organisational year automatically and cannot be manually archived. Their shared `active` column remains true; current Board representation comes from the current year and effective appointment dates.
- Manual archival of non-annual Groups removes them from current summaries and prevents new ongoing/future participation while allowing historical corrections: preserve direct Memberships and appointments, including open-ended and prepared periods. Archiving a Group does not mean its members left or its responsibilities ended. Membership changes must still preserve prerequisite coverage or be refused; archival itself does not remove that coverage.
- CSK-wide appointments require no Choir Membership.
- Enforce occupancy, Board exclusivity, period, scope, and singleton rules under concurrency. Include historical and future overlap, not only rows without an end.
- Resolve required grant Groups deterministically by the fixed catalogue and concrete year. If a required Group is missing or incompatible, return a typed refusal without partial writes; annual-group preparation provides the required set before assignments.

### Admin and member experience

- Admins have full management and correction flows for concrete Groups, direct Memberships, and Position appointments through the application. Creation, initial assignment, and ending alone are insufficient: existing current, future, and historical records must also be discoverable and editable.
- Admins can edit a Group's name and select its type, scope, and year from the fixed applicable rules. Changes affecting existing Memberships or appointments must either update the related records consistently in one transaction or return an actionable violation identifying what must be handled first.
- Direct-member editing supports dates and applicable singer placement, as well as adding and ending participation. Distinguish ordinary changes, which retain prior periods, from explicit correction of erroneous records; neither requires manual SQL.
- Appointment editing supports the holder, applicable fixed Position, concrete context, and dates, including historical corrections and prepared future appointments. An edit validates every derived target and applies any Helper conversion atomically, without changing unrelated singer Memberships or leaving stale grants. Prepared appointments can also be explicitly cancelled.
- Changing an annual appointment's year or context uses the correct concrete destination Groups and rechecks tenure, eligibility, occupancy, and Board exclusivity. Invalid edits fail without partial changes and identify the conflicting dependency.
- All editing flows retain the agreed domain constraints. Admin management of organisation data does not introduce runtime editing of the hard-coded Position definitions or Group type rules, or allow independent mutation of mandatory appointment grants.
- Group creation and lists distinguish annual Groups by year and continuing Groups by their actual identity. Known Group types determine which scope and year inputs are meaningful.
- Prepare a year's required annual Groups without automatically copying any members or appointments. Repeated preparation must not create duplicates.
- Group detail shows direct members and appointment-granted members together with their relevant Position context and history. Deduplicate people without hiding multiple responsibilities.
- Position assignment is selected from the fixed applicable catalogue. Separate duties such as choir representative and CSK office retain distinct identities even when they use related display words.
- Annual forms preset the correct last day and prevent extending an annual appointment beyond that year. Fluid forms do not invent June deadlines.
- Preserve direct-addition flows for Groups that permit them. Do not offer direct Board or Föräldramötet additions; server-side commands enforce the same rule.
- Show helpful typed eligibility, missing-group, overlap, and dependency errors. Keep the current Admin permission boundary; appointments do not add new authorization privileges.
- Relevant Group and member views expose management links or actions to Admins for the underlying Membership or single appointment. Member-facing displays reflect the same corrected data while retaining their existing visibility and authorization rules.
- Remove runtime Position creation, renaming, applicability editing, and per-group restriction editing. A read-only catalogue view is acceptable if it helps explain the fixed organisation.
- Translate new and changed user-facing copy in every supported locale, including the distinction between a Position and a news Post.

### Legacy transition, data, and documentation

- Use one integration branch for this coordinated model replacement. Add the new representation, migrate behaviour and consumers, reconcile data, then remove the old representation. Intermediate work is not a deployable partial domain migration.
- Prefer complete behaviour slices after the shared persistence foundation. Keep intermediate checks green where feasible; final cutover and integration verification gate shipment.
- Retain committed migration history. Generate new named migrations and preserve manually maintained database constraints where still applicable.
- Produce a read-only reconciliation report before changing legacy records. Report supported Position mappings, concrete Group/year mappings, paired versus independent holdings, conflicting memberships, and unsupported demo titles.
- Merge legacy holdings only with validated Position/context/year evidence. Matching User and display title alone is insufficient, particularly for someone conducting two Choirs.
- Require an explicit mapping for ambiguous years, incomplete linked appointments, conflicting holders, and unclear helper intent. Refuse conversion of unresolved records rather than silently retaining invalid active participation or deleting history.
- Preserve retained Group identities where possible, foreign references, Users, singing Memberships, Voice information, and historical participation. Do not reinterpret unrelated messages or other features as organisation Groups.
- Fresh migrations and seeds must create a valid new model. Reference data supplies the fixed organisation and required Groups; demo data exercises vacancies, handovers, annual renewal, Helpers, mixed-Choir representatives, fluid responsibilities, and historical/future participation.
- Existing development databases may be reset only through a separately explicit user instruction; being in development is not an instruction to wipe data.
- Replace the superseded versioned scheme with one coherent current specification and keep the glossary and organisation module guide aligned. Record the appointment-versus-duplicate-holdings decision in a concise proposed ADR on the introducing branch if it meets the repository's ADR criteria.

## Testing Decisions

### Proposed primary boundary for review

Test behaviour through the existing public organisation commands and read helpers against a real, disposable PostgreSQL database. This is the primary seam: invoke a command, inspect its typed result and public reads at explicit dates, and assert externally observable Membership and Position behaviour.

Existing command tests, the shared throwaway-database harness, typed command results, and Admin Server Action integration tests are the prior art. Prefer extending these rather than adding repositories, mocks, or parallel domain engines. A separate database-constraint test is justified for race and migration properties that cannot be proven through a sequential command alone.

### Coverage

- All fixed Position relationships, focusing on independent contexts and shared-group collisions rather than tests that merely repeat catalogue values.
- Three Choir Konsertmästare plus the 1:a Konsertmästare in the same Konsertmästeri; equivalent Choir Gigmästare and multiple Stämföräldrar in their aggregate Groups.
- Atomic start, replacement, ending, and refusal across every granted Group; a failure leaves no partial Membership, Helper conversion, or holding.
- Admin edits to current, prepared future, and historical Groups, Memberships, and appointments; corrected holders, contexts, years, and dates propagate through public reads and every grant, while invalid edits leave all affected data unchanged.
- A late-year appointment; 30 June/1 July; future preparations; early ending; explicit same-person renewal; historical reads after replacement.
- Vacancies and simultaneous assignment attempts; one holder per Position/context; non-overlapping future tenures; one Board Position per person.
- Direct members, Helpers becoming appointees, explicit re-addition after an appointment, and deduplication through several appointments.
- Choir, Section, and Gigledare prerequisites; preservation of independent Membership on start/end; blocked departures, shortened periods, and Section transfers; allowed within-Section Voice changes.
- Fluid Dirigent, Notfiskal, Stämförälder, and Gigledare appointments across July without renewal.
- Multiple annual Group identities, fixed scope validation, singleton choir teams, and multiple CSK-wide gig groups.
- Member profile and any existing dated consumer use of effective Membership and Position identity without private-table access.
- Real migration fixtures for paired holdings, independent same-title choir duties, unsupported demo titles, missing years, partial endings, foreign references, and repeated reconciliation.
- Fresh migration and reference/demo seed runs plus meaningful idempotency checks.

### Supporting checks

Keep focused Admin Server Action integration tests for the Admin guard, input validation, typed violations, and cache invalidation, including editing and cancellation actions. Use a limited number of real browser workflows for annual Board handover and correction, the mixed-Choir Konsertmästeri roster, and fluid responsibility changes. Include editing an existing record and recovering from a refused edit, rather than testing only creation. Verify translation completeness and supported locale rendering.

Run the repository's required type, lint, build, and relevant test checks. Database tests that skip for lack of PostgreSQL are not evidence that the new schema or migration works; complete an actual disposable-database run before marking the implementation ready. Browser checks require the running application and the installed Next.js guidance.

Test public results and user-visible workflows. Avoid snapshots of presentational components, assertions on internal query shape, or tests that duplicate the fixed configuration without exercising a domain rule.

## Out of Scope

- Implementing the application in this planning phase.
- Publishing or modifying GitHub issues; this feature's tracker is local only.
- New group or messaging-conversation concepts, deeper Group hierarchies, or redesigning Choir/Section Voices.
- Automatic annual renewal, copying members by default, shared simultaneous holders of one Position, or implicit appointment termination during departure.
- A runtime editor for formal Positions or Group types.
- New Position-derived permissions, delegated management, or changes to Admin authorization.
- New Event audience policy, Event response flows, notifications, or calendar features.
- A production database reset, live conversion, deployment, or merging the implementation.
- A new Group leader Position beyond Gigledare, or additional demo-only formal titles.

## Further Notes

The domain model was explicitly agreed after an interview covering position scope, annual versus fluid groups, direct Membership, Helpers, choir eligibility, departures, and Gigledare. The user's local-tracker override applies to this spec and its tickets without changing the repository's default tracker.

Related prior discussion: GitHub issue 106 describes the current cross-Group appointment problem. It remains unmodified; this local spec is the build instruction for this effort.

The user authorized execution of this spec and its existing test boundaries/ticket graph on 2026-10-21. Tickets 01 and 02 are already complete. Individual ticket files retain their existing `drafts/issues` paths; their Status fields track implementation and validation.

The Group type catalogue includes a conservative compatibility treatment for Övrig, which was not newly specified in the interview. It grants no new formal Positions. If existing data cannot fit the agreed rules, the reconciliation report must identify that gap instead of inventing a domain rule.

