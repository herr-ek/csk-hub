# Integration review

Reviewed `bd4827c...2416510` with two independent current-model reviewers. The disposable-database execution override applies. Findings are being fixed by one gpt-6-luna implementer on `implement/org-final-review-fixes`.

## Standards

Documented-standard breaches:

1. `src/features/org-structure/ui/detail/EffectiveMembersSection.tsx:1`: `"use client"` makes this pure roster renderer and its `GroupDetail` payload cross the client boundary. It has no state, event handlers, or browser APIs; its translation hook is explicitly universal. `docs/codebase-structure.md#nextjs-and-react` requires Server Components by default and client boundaries as low as practical. Remove the directive and render this section on the server.

2. `src/features/org-structure/ui/detail/AppointmentManagement.tsx:88`: the option label concatenates translated fragments: `${positionLabel(...)}${occupied.has(...) ? ` · ${t("replaceHolder")}` : ""}`. `src/core/i18n/README.md#catalogs-and-keys` says “Use ICU parameters instead of concatenating translated fragments.” Add a translated occupied-position label accepting the Position as a parameter in all three catalogs.

Judgment call — possible Duplicated Code:

3. Complete continuous-period coverage is implemented separately in `src/features/org-structure/direct-membership.ts:195` (`covers`), `src/features/org-structure/appointments.ts:88` (`requirePrerequisiteCoverage`), and `scripts/ops/seed-group-activity.ts:49` (`memberAt`). Each sorts dates, advances a coverage boundary, rejects gaps, and handles an open end; compare `if (row.startDate > until) break` with `if (membership.startDate > coveredUntil) break`. This is one business rule with three maintenance sites. Consider a pure period-coverage function in the universal model, keeping each query and error mapping local. This follows `docs/codebase-structure.md#reuse-and-duplication`; the recommendation is a heuristic, not a hard violation.

No additional material Standards findings. Tool-enforced issues are excluded.


## Spec

- **P2 — Restore the ordinary Choir-departure workflow.** Spec: “Direct-member editing supports dates and applicable singer placement, as well as adding and ending participation.” Ticket 05 also requires flows to “retain singing-membership controls.” The replacement UI sends every End action to `endDirectMembership` (`ui/detail/direct-actions.ts:75`), which shortens only the selected Choir period. For an ordinary singer with ongoing Section/team Memberships, `validateUserParticipation` then returns `not-a-choir-member` and rolls back. The existing atomic Choir/Section/team departure command remains in `membership.ts:114`, but its Server Action has no UI callers. Preserve an ordinary departure action using that command while retaining appointment-dependency refusal; otherwise Admins must locate and end each dependent period manually.

- **P2 — Derive annual form dates from the selected year.** Spec: “Annual forms preset the correct last day and prevent extending an annual appointment beyond that year.” In `ui/detail/AppointmentManagement.tsx:72–108`, the Choir year selector is uncontrolled, while the last-day default always derives from `availableYears[0]`; neither date has year bounds. Fresh seeds prepare 2026 and 2027, sorted descending. Choosing 2026 therefore retains 2028-06-30, causing an otherwise valid current-year assignment to fail with `period-conflict`. The default future year also starts with today's 2026 date. Track the chosen year, preset matching dates, and constrain both assignment and correction inputs.

- **P2 — Include archived Sections in historical placement correction.** Spec: “existing current, future, and historical records must also be discoverable and editable,” including “applicable singer placement.” `ui/detail/query.ts:69–75` offers only active Sections to the correction form (`DirectMembersSection.tsx:166–175`). Archiving a Choir archives all its Sections, leaving this selector with no options. Its existing default can retain the original ID, but Admins cannot select an archived sibling Section to correct erroneous historical placement, although `correctDirectMembership` permits that same-Choir correction. Include historical destinations for correction while retaining active-only options for ordinary changes.

No material unrequested scope expansion found. These are fresh static findings at `2416510`; runtime reproduction remains with the parent review.


Standards:3 findings (2 documented breaches and1 heuristic; primary breach: unnecessary client boundary). Spec:3 P2 findings (primary: inaccessible atomic Choir departure). Findings remain pending correction and re-verification.
