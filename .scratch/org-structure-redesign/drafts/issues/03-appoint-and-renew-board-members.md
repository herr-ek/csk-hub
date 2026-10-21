# 03: Appoint, replace, and renew annual Board members

**What to build:** Deliver one appointment lifecycle from Admin assignment through the Board and every mandatory companion Group. A Sexmästare belongs to the concrete year's Board and Sexmästeri through one appointment; a Sekreterare belongs to that Board and the continuing Föräldramötet.

**Blocked by:** 02: Manage annual Groups and fluid direct Memberships.

**Status:** complete — implemented, merged, and acceptance-verified on `implement/org-structure-redesign` (2026-10-21), including the archived-history review follow-up; final whole-spec review remains ticket08.

**Spec:** [Positions and Groups Redesign](../../spec.md)

**User stories:** 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 28, 34, 38, 44, 45, 46, 49, 50, 51.

- [x] An Admin can appoint a Board Position without first adding a direct Board member or requiring any Choir Membership.
- [x] Each Board Position grants exactly the concrete Groups in the spec, using the appointment's own year for annual targets.
- [x] Appointing Sexmästare creates one appointment visible in the Board and Sexmästeri; Sekreterare reaches only its Board and fluid Föräldramötet.
- [x] Missing or incompatible companion Groups cause a typed refusal with no partial appointment, grant, or Helper conversion.
- [x] Replacement and ending operate on the whole appointment, removing the predecessor's participation everywhere that appointment granted it.
- [x] Admins can edit an existing appointment's holder, applicable Board Position, concrete Board/year, and dates, including explicit historical corrections and future changes; mandatory grants and applicable Helper conversions update atomically.
- [x] Prepared appointments can be explicitly cancelled, and both current and historical appointments are discoverable in the management UI.
- [x] Invalid edits return an actionable typed violation with no partial change; public-read and browser checks demonstrate correction of an existing appointment as well as creation and handover.
- [x] An overlapping Helper Membership in a granted committee ends atomically when the appointment starts; its earlier history remains.
- [x] Ending the appointment does not restore the Helper Membership; an explicit later addition can retain the former holder as a Helper.
- [x] Annual forms preset 30 June as the last day; storage uses the exclusive 1 July boundary, and extending beyond the year is refused.
- [x] Vacancies and September appointments work; next-year preparation is not current early; annual renewal requires a separate explicit appointment even for the same person.
- [x] One person cannot hold overlapping Positions on the same Board, but may hold an independent Position outside that Board.
- [x] Member lists deduplicate grant paths while returning every relevant Position and context.
- [x] Refused commands and concurrent handovers cannot leave partial memberships or duplicate holders, including future tenures.
- [x] Admin flows expose one assignment/handover decision rather than separate per-Group holdings, and use translated typed errors.
- [x] Real PostgreSQL tests and an Admin browser workflow cover start, replacement, end, July rollover, and preservation of unrelated Memberships.



**Implementation evidence:** `appointments.test.ts` and `ui/actions.test.ts` pass against the disposable PostgreSQL instance at `localhost:55441` (32 tests total); `bun run typecheck` and targeted Biome lint pass. Coverage includes Sexmästare and Sekreterare grants, missing companion rollback, Helper conversion/history, concurrent handover, holder/year correction, inclusive June conversion, end, and prepared cancellation. The shared command dialog caps its height to the viewport and scrolls its contents on short screens; parent browser re-verification passed.

**Commit:** `86dabea`; integration merge `a9e918d`. All ticket03 acceptance criteria are now checked against command/read tests, the focused acceptance audit and actual browser verification below.

## Integration verification (2026-10-21)

- Full suite after merge: **501 passed, 0 failed, no skips** against disposable PostgreSQL (`/private/tmp/csk-org-ticket03-integrated-tests.log`).
- Real browser on integration: prepared 26/27; assigned Sexmästare without Choir Membership; refused an out-of-year correction and retained the form; recovered with a valid holder correction; scheduled a next-day handover.
- Public dated reads confirm Board and Sexmästeri contain the identical appointment on each side of the handover and both expire on 1 July; evidence `/private/tmp/csk-org-board-browser-read-evidence.jsonl`.
- Browser uncovered clipped correction controls on short screens. Follow-up `c5e1ba2` (merge `b02e63b`) constrains dialog height and scrolls content. Reverified refusal recovery at 1280×576 and visual layout at 390×844.
- Next.js MCP compilation and runtime checks report no errors. Native date automation needed direct DOM input-value events because this agent-browser version clears date fields on fill.
- Full catalogue, Helper re-addition and explicit renewal were subsequently verified by the focused public-boundary audit below. Final consumer integration, complete locale rendering and coordinated cutover remain owned by tickets06–08.
- Browser early ending: appointed Ordförande from 1 September, ended it with last day 20 October, and verified retained historical row with no current End control. React tree evidence captured in `/private/tmp/csk-org-board-react-tree.txt`; final MCP compilation/runtime recheck stayed clean.

## Checkbox audit requested by user

All 17 criteria are complete and checked. A fresh disposable-PostgreSQL audit through public commands/reads verified all eight Board offices and their exact own-year grant targets, Board exclusivity plus an independent Choir duty, Helper history with no automatic restoration and successful explicit re-addition, future-year vacancy, explicit same-person renewal with a new appointment identity, July expiry and preservation of independent Choir participation. Result: **PASS** (`/private/tmp/csk-org-ticket03-acceptance-audit.log`; script `/private/tmp/csk-org-browser-tools/.scratch/org-structure-redesign/audit-ticket03.ts`). Existing appointment tests also prove one deduplicated roster row retains all three independent Choir appointment contexts.

Browser evidence above completes creation, refused edit/recovery, correction, handover and early ending. The complete spec still requires tickets06–08 and final review; a later discovered regression will reopen the relevant criterion rather than leave this checklist misleading.

## Whole-spec review follow-up

A later public-boundary review found that a completed Board may be archived, after which its historical appointment correction returns `group-archived` and the UI hides the correction action. The historical-editing criterion is reopened until this edge case is fixed and reverified. Reproduction and evidence: `/private/tmp/csk-org-review-lifecycle.log`. The prior 17-criterion audit remains evidence for the verified active-Group flows; this follow-up supersedes its blanket completion statement. Helper addition during an existing appointment also needs a final invariant fix; explicit re-addition after ending remains verified.

## Review follow-up resolved

Follow-up `d4b65d2`, integration merge `13845c5`, closes the archived-history and Helper-overlap findings. PostgreSQL checks: 52 focused appointment/direct-membership/action tests and 19 structure tests pass; typecheck/full lint pass. Forged cancellation dates are ignored in favor of the server calendar date.

Parent browser verification in Swedish corrected an ended 2020/21 Sexmästare while both its Board and Sexmästeri were archived, then corrected the archived Board name. Public dated reads confirm the same appointment identity in both Groups, absent on 31 July and present on 1 August after correction (`/private/tmp/csk-org-browser-archived-read.log`). A fresh public-boundary regression probe now refuses overlapping Helper addition and accepts archived historical correction (`/private/tmp/csk-org-review-lifecycle-fixed.log`). Next compilation/runtime diagnostics remain clean. All 17 criteria are checked again; this resolved follow-up supersedes the pending review note above.
