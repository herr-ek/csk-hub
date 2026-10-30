# 04: Bring every Choir's representatives into shared annual Groups

**What to build:** Let an Admin appoint each Choir's Konsertmästare and Gigmästare using existing Choir Membership as eligibility. Deliver mixed-Choir Konsertmästeri and Gigmästeri rosters with annual expiry, explicit renewal, and one lifecycle for each representative.

**Blocked by:** 03: Appoint, replace, and renew annual Board members.

**Status:** complete — implemented, merged and browser-verified on `implement/org-structure-redesign` (2026-10-21); final whole-spec review remains ticket08.

**Spec:** [Positions and Groups Redesign](../../spec.md)

**User stories:** 1, 2, 4, 5, 12, 13, 14, 16, 17, 21, 22, 23, 31, 34, 38, 44, 45, 46, 49, 50, 51.

- [x] MK, DK, and KK can each appoint their own Konsertmästare without colliding in the same year's Konsertmästeri.
- [x] The Konsertmästeri roster shows the 1:a Konsertmästare plus all three Choir representatives, with Choir context preserved in labels and public read results.
- [x] Equivalent Choir Gigmästare appointments coexist in Gigmästeriet alongside the separate CSK Gigmästare.
- [x] One fixed Choir Gigmästare definition is reused across Choirs; display names are not used as identity or as a replacement for context.
- [x] Appointing a Choir Position requires existing Membership in that exact Choir for the tenure; failure never enrols the User.
- [x] Taking, replacing, ending, or renewing a representative appointment preserves independent Choir and Section Memberships.
- [x] Each representative appointment ends on 30 June; renewal into next year's aggregate requires an explicitly renewed appointment.
- [x] Starting an appointment closes an overlapping Helper Membership only in the Group receiving the grant, not in the required Choir.
- [x] Leaving or shortening the prerequisite Choir Membership while the representative appointment would remain is refused until the appointment is explicitly handled.
- [x] A person may represent two Choirs they belong to, or hold a Choir Position and an independent Board Position; aggregate rosters show one person with all responsibilities.
- [x] Admin selection, roster display, handover, and translated errors distinguish the appointment's Choir from the shared Group.
- [x] Admins can edit a representative's holder, applicable Position, context Choir, and dates/year through the UI, including explicit corrections and future cancellations; the destination Choir Membership is required and all aggregate grants update consistently.
- [x] Editing or correcting an appointment never enrols the holder in a Choir, leaves a grant in the previous year's aggregate, or silently changes independent singing Memberships; invalid edits roll back atomically.
- [x] Real PostgreSQL tests cover all three Choir contexts, multiple grant paths, handovers, blocked departures, vacancies, and explicit renewal. A real browser verifies the complete mixed-Choir Konsertmästeri roster.


**Integration:** merged `7a0c36b` as `494b875` on `implement/org-structure-redesign`. Browser verification passed; final consumer/cutover integration remains owned by tickets06–08.

## Parent browser verification

Assigned annual Konsertmästare from MK, DK and KK through each Choir's fixed-position/year form, then assigned the Board 1:a Konsertmästare. Konsertmästeriet 26/27 shows exactly four people with distinct MK/DK/KK/Board contexts and management links. German labels render correctly; mobile screenshot `/private/tmp/csk-org-konsertmasteri-mobile.png`. Next.js compilation/runtime checks are clean. Final consumer/cutover verification and other locale rendering remain with tickets06/08.
