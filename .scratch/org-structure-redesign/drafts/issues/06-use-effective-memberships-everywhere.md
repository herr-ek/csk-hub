# 06: Show effective Membership and scoped Positions to every existing consumer

**What to build:** Make member profiles, directory summaries, Group screens, and any existing dated consumer agree on who belongs and which responsibilities they hold. Deliver one public effective-Membership interpretation rather than consumer-specific unions of direct and granted records.

**Blocked by:** 04: Bring every Choir's representatives into shared annual Groups; 05: Manage fluid responsibilities without changing singer Membership.

**Status:** complete — implemented, merged, and browser-verified on `implement/org-structure-redesign` (2026-10-21); final whole-spec review remains ticket08.

**Spec:** [Positions and Groups Redesign](../../spec.md)

**User stories:** 2, 13, 14, 27, 28, 39, 40, 46, 51.

- [x] Public current and dated read helpers include direct Membership and appointment grants using the same period rules (`listEffectiveMembersCurrent`, `listEffectiveMembersAt`, user and directory reads).
- [x] A member profile shows independent singing Membership alongside appointment-granted Board or committee participation without duplicated people or hidden Positions (real PostgreSQL service test).
- [x] Relevant Group and member views give Admins access to management of the underlying direct Membership or single appointment, including discoverable current, future, and historical records; ordinary member visibility and authorization stay consistent with existing policy (Admin-only history links to guarded Group detail flows; query auth test).
- [x] Member-facing and Admin displays reflect corrected Group, Membership, and appointment data through the same public reads after edits and cache invalidation (successful org commands revalidate directory, member profile, and own profile routes).
- [x] Position summaries distinguish CSK versus Choir responsibilities and include exact Choir, Section, gig-group, and annual Group context as relevant (fixed code translated at presentation, appointment IDs retained).
- [x] Future appointments and expired annual Memberships are absent from current affiliation summaries but available through appropriate history or dated reads (July-boundary PostgreSQL profile case; Admin profile lists dated records).
- [x] Directory Choir/Section summaries retain existing visibility, inactive-user behaviour, and grouping rules (existing real PostgreSQL directory/privacy suite passes).
- [x] Existing Group member queries and affiliation consumers use the organisation module's public interface, without directly reconstructing grant logic (Group roster/counts and member service call public reads).
- [x] No dated Event audience consumer exists in runtime source; `src/features/events` contains only schema tests, so no Event adapter was needed.
- [x] Public interfaces return meaningful Membership periods and Position identity; they do not force consumers to join private organisation tables.
- [x] Integration tests at the member-service boundary demonstrate granted-membership visibility, deduplication, context labels, July changes, and history (PostgreSQL suite).
- [x] Relevant UI rendering and navigation are verified with ordinary-member and Admin fixture sessions; translations, type check, lint, and real-data service regressions pass.

Verification: 64 targeted tests passed against the supplied PostgreSQL instance (229 assertions), including the merged fluid-lifecycle cases; `bun run typecheck` and full `bun run lint` passed. The effective participation DTOs live in the universal organization model, while legacy adaptation and date interpretation remain inside the organization module. Group rosters and attached appointments are read in batches for the overview. Parent browser review passed; evidence below.


**Integration:** implementation/review commits through `b111761`, merged as `197394b`. PostgreSQL target suite 64 passed, no failures; typecheck/full lint pass. Parent browser verification passed; evidence below.

## Parent integration evidence

- Full suite on integrated read changes: **518 passed, 0 failed, no skips** (`/private/tmp/csk-org-ticket06-integrated-tests.log`).
- Browser profile correctly combines independent DK/Section/S1 placement with Choir and Board responsibilities, granted Groups and Admin source-history links. No other-member email is shown.
- Browser found raw exclusive ends in history; follow-up `18ccdc9`, merged as `73b9558`, displays inclusive last days (June30, October20) and removes duplicate context from trailing Group names. Reverified through actual rendered profile.
- Ordinary-member browser session shows responsibilities and DK/Section/S1 but no Admin history/actions or other-member email. Directory retains DK · DKS1 and KK summaries, includes unassigned people and hides the viewer. Admin history link opens the correct Board and its editable record. Browser criterion is complete.
