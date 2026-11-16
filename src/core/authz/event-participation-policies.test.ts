import { describe, expect, test } from "bun:test"
import type { AuthorizationActor, PermissionContext } from "./model"
import { evaluatePermission } from "./policy-registry"

const member: AuthorizationActor = { userId: "member", isAdmin: false }
const manager: AuthorizationActor = { userId: "manager", isAdmin: false }
const parent: AuthorizationActor = { userId: "parent", isAdmin: false }
const admin: AuthorizationActor = { userId: "admin", isAdmin: true }
const now = new Date("2026-11-16T12:00:00Z")
const group = { id: "organiser", type: "Board" as const, active: true }
const section = { id: "section", type: "Section" as const, active: true }
const event = {
  id: "event",
  organiserGroupId: group.id,
  type: "Rehearsal" as const,
  status: "Published" as const,
  startsAt: new Date("2026-10-01T16:00Z")
}
const context: PermissionContext["event.readAttendance"] = {
  event,
  group,
  memberships: [{ userId: manager.userId, groupId: group.id, startDate: "2020-01-01", endDate: null }],
  positionHoldings: [
    {
      userId: manager.userId,
      groupId: group.id,
      positionId: "manager-position",
      startDate: "2020-01-01",
      endDate: null
    }
  ],
  record: { eventId: "event", userId: member.userId },
  targets: [{ groupId: section.id, groupType: "Section", voiceFamily: null }],
  subjectMemberships: [
    {
      groupId: section.id,
      groupType: "Section",
      choirId: "choir",
      voice: "B1",
      startDate: "2020-01-01",
      endDate: "2026-10-02"
    }
  ],
  sections: [section],
  sectionHoldings: [
    {
      userId: parent.userId,
      groupId: section.id,
      positionId: "parent-position",
      positionCode: "stamforalder",
      startDate: "2026-11-01",
      endDate: null
    }
  ],
  now
}

describe("Event audience and private participation policies", () => {
  test("future departure removes access immediately; after start historical membership preserves viewing", () => {
    const request = { ...context, event, audienceMemberships: context.subjectMemberships }
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

  test("response reasons and registration answers allow only self, Admin or current Event manager", () => {
    for (const action of ["event.readResponseReason", "event.readRegistrationAnswers"] as const) {
      for (const actor of [member, manager, admin]) expect(evaluatePermission(actor, { action, context })).toBe(true)
      for (const actor of [parent, { userId: "stranger", isAdmin: false }, null])
        expect(evaluatePermission(actor, { action, context })).toBe(false)
      expect(evaluatePermission(manager, { action, context: { ...context, positionHoldings: [] } })).toBe(false)
      expect(
        evaluatePermission(admin, {
          action,
          context: { ...context, record: { eventId: "another-event", userId: admin.userId } }
        })
      ).toBe(false)
      expect(
        evaluatePermission(member, { action, context: { ...context, record: { eventId: "event", userId: null } } })
      ).toBe(false)
      expect(
        evaluatePermission(admin, { action, context: { ...context, record: { eventId: "event", userId: null } } })
      ).toBe(true)
    }
  })

  test("Section parents can view and correct only Rehearsal/Concert attendance, using the subject's Section at start", () => {
    for (const type of ["Rehearsal", "Concert", "Gig", "Social", "Meeting"] as const) {
      const facts = { ...context, event: { ...event, type } }
      const eligible = type === "Rehearsal" || type === "Concert"
      expect(evaluatePermission(parent, { action: "event.readAttendance", context: facts })).toBe(eligible)
      expect(evaluatePermission(parent, { action: "event.recordAttendance", context: facts })).toBe(eligible)
      expect(evaluatePermission(member, { action: "event.readAttendance", context: facts })).toBe(true)
      expect(evaluatePermission(member, { action: "event.recordAttendance", context: facts })).toBe(false)
      expect(evaluatePermission(manager, { action: "event.recordAttendance", context: facts })).toBe(true)
    }
    for (const change of [
      { sectionHoldings: [] },
      { sectionHoldings: context.sectionHoldings.map((h) => ({ ...h, startDate: "2027-01-01" })) },
      { sectionHoldings: context.sectionHoldings.map((h) => ({ ...h, endDate: "2026-11-15" })) },
      { sectionHoldings: context.sectionHoldings.map((h) => ({ ...h, positionCode: null })) },
      { sectionHoldings: context.sectionHoldings.map((h) => ({ ...h, userId: "another-parent" })) },
      { sections: [{ ...section, active: false }] },
      { subjectMemberships: context.subjectMemberships.map((m) => ({ ...m, groupId: "another-section" })) },
      { subjectMemberships: context.subjectMemberships.map((m) => ({ ...m, startDate: "2026-10-02", endDate: null })) }
    ]) {
      expect(evaluatePermission(parent, { action: "event.readAttendance", context: { ...context, ...change } })).toBe(
        false
      )
      expect(evaluatePermission(parent, { action: "event.recordAttendance", context: { ...context, ...change } })).toBe(
        false
      )
    }
  })

  test("recording requires a Published Event and audience subject, even for Admin; reading kept records survives cancellation", () => {
    for (const status of ["Draft", "Cancelled"] as const) {
      const facts = { ...context, event: { ...event, status } }
      expect(evaluatePermission(admin, { action: "event.recordAttendance", context: facts })).toBe(false)
      expect(evaluatePermission(parent, { action: "event.readAttendance", context: facts })).toBe(true)
    }
    expect(
      evaluatePermission(admin, { action: "event.recordAttendance", context: { ...context, subjectMemberships: [] } })
    ).toBe(false)
    for (const actor of [member, parent, manager, admin, null]) {
      expect(evaluatePermission(actor, { action: "event.readAttendance", context: { ...context, event: null } })).toBe(
        false
      )
      expect(
        evaluatePermission(actor, { action: "event.recordAttendance", context: { ...context, record: null } })
      ).toBe(false)
    }
  })
})
