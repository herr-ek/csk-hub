import { expect, test } from "bun:test"
import type { AuthorizationActor, PermissionContext } from "./model"
import { evaluatePermission } from "./policy-registry"

const member: AuthorizationActor = { userId: "member", isAdmin: false }
const now = new Date("2026-11-16T12:00:00Z")
const event = {
  id: "event",
  organiserGroupId: "organiser",
  type: "Rehearsal" as const,
  status: "Published" as const,
  startsAt: new Date("2026-10-01T16:00Z")
}
const context: PermissionContext["event.view"] = {
  event,
  group: { id: "organiser", type: "Board", active: true },
  memberships: [],
  positionHoldings: [],
  targets: [{ groupId: "section", groupType: "Section", voiceFamily: null }],
  audienceMemberships: [
    {
      groupId: "section",
      groupType: "Section",
      choirId: "choir",
      voice: "B1",
      startDate: "2020-01-01",
      endDate: "2026-10-02"
    }
  ],
  now
}

test("future departure removes access immediately; after start historical membership preserves viewing", () => {
  const request = context
  expect(
    evaluatePermission(member, { action: "event.view", context: { ...request, now: new Date("2026-09-30") } })
  ).toBe(false)
  expect(
    evaluatePermission(member, {
      action: "event.view",
      context: {
        ...request,
        audienceMemberships: request.audienceMemberships.map((m) => ({ ...m, endDate: null })),
        now: new Date("2026-09-30")
      }
    })
  ).toBe(true)
  expect(evaluatePermission(member, { action: "event.view", context: request })).toBe(true)
  // A multi-day Event never switches the membership reference to its current day or end.
  expect(
    evaluatePermission(member, { action: "event.view", context: { ...request, now: new Date("2026-10-03") } })
  ).toBe(true)
  expect(
    evaluatePermission(member, {
      action: "event.view",
      context: {
        ...request,
        audienceMemberships: request.audienceMemberships.map((m) => ({
          ...m,
          startDate: "2026-10-02",
          endDate: null
        }))
      }
    })
  ).toBe(false)
  expect(
    evaluatePermission(member, {
      action: "event.view",
      context: { ...request, event: { ...event, status: "Draft" } }
    })
  ).toBe(false)
})
