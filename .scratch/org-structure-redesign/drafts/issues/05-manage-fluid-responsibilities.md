# 05: Manage fluid responsibilities without changing singer Membership

**What to build:** Deliver fluid Dirigent, Notfiskal, Stämförälder, and Gigledare assignments. Föräldramötet follows current Stämföräldrar and the annual Sekreterare, while the prerequisite singing Memberships survive appointment changes.

**Blocked by:** 03: Appoint, replace, and renew annual Board members.

**Status:** complete — implemented, merged and acceptance-verified on `implement/org-structure-redesign` (2026-10-21); final whole-spec review remains ticket08.

**Spec:** [Positions and Groups Redesign](../../spec.md)

**User stories:** 2, 12, 13, 14, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 38, 45, 46, 49, 50, 51.

- [x] Dirigent and Notfiskal require Membership in their exact Choir, have no forced June end, and do not create Choir Membership.
- [x] Stämförälder requires Membership in its exact Section; Gigledare requires Membership in its exact gig group.
- [x] Taking, replacing, or ending these appointments preserves required direct Memberships, including Section Voice data.
- [x] These fluid appointments continue across 30 June/1 July without implicit replacement or annual renewal.
- [x] Multiple Section Stämföräldrar coexist in the single continuing Föräldramötet, with their Section and Choir context visible.
- [x] Föräldramötet contains the current Stämföräldrar and current Sekreterare only; expired or future appointments do not grant current participation.
- [x] Ending one appointment preserves participation through another active appointment while showing every responsibility.
- [x] A Section departure or transfer is refused while a Stämförälder appointment would remain; a Choir departure cannot bypass this through its Section cascade.
- [x] A Voice change within the same Section preserves the Stämförälder appointment and its Föräldramötet participation.
- [x] A gig-group departure or Membership shortening is refused while a Gigledare appointment depends on it; explicitly ending leadership allows departure.
- [x] Appointing or ending Gigledare never converts a singer into a Helper or removes that person's direct gig-group Membership.
- [x] Membership shortening and archive-related operations cannot silently strand any prerequisite-dependent appointment, including prepared future tenures.
- [x] Admin flows use the fixed applicable Position list, retain singing-membership controls, and explain dependency refusals in all supported locales.
- [x] Admins can edit existing fluid appointments, including holder, applicable Position, context, and dates, discover and explicitly correct history, and amend or cancel future entries through the management UI.
- [x] Editing rechecks the new prerequisite Membership, updates Föräldramötet participation where applicable, preserves independent singer Memberships, and fails atomically on conflicts; tests cover a successful edit and a refused edit.
- [x] Real PostgreSQL tests cover all four fluid Positions, several Sections, the Sekreterare year boundary, tenure coverage, and refused atomic changes; a real browser workflow checks responsibility handover without singer removal.


**Integration:** `ecc40fb` + formatter `4b327e1` + review fixes `b0eed0e`, merged as `32d6c1c`; lifecycle coverage commits `f99e2fc` and `f7a6300` merged as `2d8b91d`.

## Parent browser verification

On integration `32d6c1c`, English fluid-role assignment refused an ineligible Choir user, retained the form and recovered with an eligible assignment. Conductor had no June deadline. A dated handover retained both historical/current appointments; a future Music Librarian appointment exposed cancellation and was removed explicitly. Public reads verify unchanged Choir/Section Membership IDs, July join dates and S1 Voice data for both singers at 21 October and next 1 July (`/private/tmp/csk-org-fluid-browser-read-evidence.jsonl`). Next.js compilation/runtime checks are clean.

Luna's focused PostgreSQL lifecycle suite verifies aggregate-parent/Secretary dates, multiple Section contexts, Voice changes, blocked departures, and future-tenure protection. Combined target suite: 25 tests, 0 failures, 113 assertions; typecheck and full lint pass.
