import { describe, expect, test } from "bun:test"
import {
  cskToday,
  currentOrganisationYear,
  GroupType,
  organisationYearPeriod,
  PositionCode,
  shiftDate
} from "@/core/org-structure"
import type {
  AuthorizationActor,
  GroupAttributes,
  PermissionContext,
  PermissionRequest,
  PositionAppointmentAttributes,
  PostAttributes
} from "./model"
import { evaluatePermission } from "./policy-registry"

const owner: AuthorizationActor = { userId: "owner", isAdmin: false }
const other: AuthorizationActor = { userId: "other", isAdmin: false }
const admin: AuthorizationActor = { userId: "admin", isAdmin: true }

function post(state: "draft" | "published" | "discarded", authorId: string | null = owner.userId): PostAttributes {
  return {
    id: "post",
    authorId,
    publishedAt: state === "published" ? new Date("2026-01-01") : null,
    discardedAt: state === "discarded" ? new Date("2026-01-01") : null
  }
}

const group: GroupAttributes = { id: "group", type: GroupType.Board, active: true }
const holding: PositionAppointmentAttributes = {
  userId: owner.userId,
  contextGroupId: group.id,
  positionCode: PositionCode.Chair,
  ...organisationYearPeriod(currentOrganisationYear(cskToday()))
}
const groupContext: PermissionContext["group.manageContent"] = {
  group,
  positionAppointments: [holding]
}

test("baseline application access allows active actors and denies anonymous requests", () => {
  expect(evaluatePermission(owner, { action: "app.access" })).toBe(true)
  expect(evaluatePermission(admin, { action: "app.access" })).toBe(true)
  expect(evaluatePermission(null, { action: "app.access" })).toBe(false)
})

describe("personal Post policies", () => {
  test("any active actor may create personal content without organisational facts", () => {
    expect(evaluatePermission(owner, { action: "post.create" })).toBe(true)
    expect(evaluatePermission(admin, { action: "post.create" })).toBe(true)
    expect(evaluatePermission(null, { action: "post.create" })).toBe(false)
  })

  test("private Drafts belong only to their author, including against an Admin", () => {
    for (const action of ["post.read", "post.update", "post.publish", "post.discard"] as const) {
      const request = { action, context: { post: post("draft") } }
      expect(evaluatePermission(owner, request)).toBe(true)
      expect(evaluatePermission(other, request)).toBe(false)
      expect(evaluatePermission(admin, request)).toBe(false)
    }
    expect(evaluatePermission(owner, { action: "post.unpublish", context: { post: post("draft") } })).toBe(false)
  })

  test("published Posts are readable by all active actors and managed by their author or Admin", () => {
    const context = { post: post("published") }
    expect(evaluatePermission(other, { action: "post.read", context })).toBe(true)
    for (const action of ["post.update", "post.unpublish"] as const) {
      expect(evaluatePermission(owner, { action, context })).toBe(true)
      expect(evaluatePermission(admin, { action, context })).toBe(true)
      expect(evaluatePermission(other, { action, context })).toBe(false)
    }
    for (const action of ["post.publish", "post.discard"] as const) {
      expect(evaluatePermission(owner, { action, context })).toBe(false)
      expect(evaluatePermission(admin, { action, context })).toBe(false)
    }
  })

  test("an erased author's published content retains only explicit Admin management", () => {
    const context = { post: post("published", null) }
    expect(evaluatePermission(other, { action: "post.read", context })).toBe(true)
    expect(evaluatePermission(owner, { action: "post.update", context })).toBe(false)
    expect(evaluatePermission(admin, { action: "post.update", context })).toBe(true)
  })

  test("missing and discarded Posts deny every resource action, even for Admin", () => {
    for (const resource of [null, post("discarded")]) {
      for (const action of ["post.read", "post.update", "post.publish", "post.unpublish", "post.discard"] as const) {
        expect(evaluatePermission(owner, { action, context: { post: resource } })).toBe(false)
        expect(evaluatePermission(admin, { action, context: { post: resource } })).toBe(false)
      }
    }
  })
})

describe("Group policies", () => {
  test("Board work needs a current appointment for this actor in this exact Group", () => {
    for (const action of ["group.publishPost", "group.manageContent", "group.manageEvents"] as const) {
      expect(evaluatePermission(owner, { action, context: groupContext })).toBe(true)
      expect(evaluatePermission(other, { action, context: groupContext })).toBe(false)
      expect(evaluatePermission(owner, { action, context: { ...groupContext, positionAppointments: [] } })).toBe(false)
      expect(
        evaluatePermission(owner, { action, context: { ...groupContext, group: { ...group, id: "another-group" } } })
      ).toBe(false)
      expect(
        evaluatePermission(owner, {
          action,
          context: { ...groupContext, positionAppointments: [{ ...holding, userId: other.userId }] }
        })
      ).toBe(false)
    }
  })

  test("Choir work and Membership/Position administration require explicit Admin authority", () => {
    for (const action of ["group.publishPost", "group.manageContent", "group.manageEvents"] as const) {
      const context = { ...groupContext, group: { ...group, type: GroupType.Choir } }
      expect(evaluatePermission(owner, { action, context })).toBe(false)
      expect(evaluatePermission(admin, { action, context })).toBe(true)
      expect(evaluatePermission(admin, { action, context: { group, positionAppointments: [] } })).toBe(true)
    }
    for (const action of ["group.manageMemberships", "group.managePositions"] as const) {
      expect(evaluatePermission(owner, { action, context: { group } })).toBe(false)
      expect(evaluatePermission(admin, { action, context: { group } })).toBe(true)
    }
  })

  test("missing and archived Groups deny even Admin", () => {
    for (const resource of [null, { ...group, active: false }]) {
      for (const action of [
        "group.publishPost",
        "group.manageContent",
        "group.manageEvents",
        "group.manageMemberships",
        "group.managePositions"
      ] as const) {
        expect(evaluatePermission(admin, { action, context: { ...groupContext, group: resource } })).toBe(false)
      }
    }
  })

  test("periods exclude prepared and ended participation and include current dated terms", () => {
    const today = cskToday()
    const tomorrow = shiftDate(today, 1)
    for (const dates of [
      { startDate: tomorrow, endDate: null },
      { startDate: holding.startDate, endDate: today }
    ]) {
      expect(
        evaluatePermission(owner, {
          action: "group.manageContent",
          context: { ...groupContext, positionAppointments: [{ ...holding, ...dates }] }
        })
      ).toBe(false)
    }
    expect(
      evaluatePermission(owner, {
        action: "group.manageContent",
        context: { ...groupContext, positionAppointments: [{ ...holding, startDate: today, endDate: tomorrow }] }
      })
    ).toBe(true)
  })
})

describe("Event policies", () => {
  const event = { id: "event", organiserGroupId: group.id, type: "Gig" as const, seriesId: null }
  const context = {
    ...groupContext,
    groups: [group],
    targets: [],
    event,
    proposedOrganiser: groupContext,
    proposedEvent: { type: "Gig" as const, targets: [] }
  }

  test("creation requires exact active non-Choir representation or explicit Admin authority", () => {
    expect(evaluatePermission(owner, { action: "event.create", context: groupContext })).toBe(true)
    for (const facts of [
      { ...groupContext, group: null },
      { ...groupContext, group: { ...group, active: false } },
      { ...groupContext, group: { ...group, type: GroupType.Choir } },
      { ...groupContext, positionAppointments: [] }
    ]) {
      expect(evaluatePermission(owner, { action: "event.create", context: facts })).toBe(false)
      expect(evaluatePermission(admin, { action: "event.create", context: facts })).toBe(true)
    }
  })

  test("updates require authority for both existing and proposed organisers, including removal", () => {
    for (const proposedOrganiser of [
      { ...groupContext, group: null },
      { ...groupContext, group: { ...group, id: "foreign" } },
      { ...groupContext, group: { ...group, type: GroupType.Choir } },
      { ...groupContext, group: { ...group, active: false } }
    ]) {
      expect(evaluatePermission(owner, { action: "event.update", context: { ...context, proposedOrganiser } })).toBe(
        false
      )
      expect(evaluatePermission(admin, { action: "event.update", context: { ...context, proposedOrganiser } })).toBe(
        true
      )
    }
  })

  test("every instance action binds the Event to its organiser; Admin can manage orphaned or archived organisers", () => {
    for (const action of ["event.read", "event.update", "event.changeStatus", "event.delete"] as const) {
      expect(evaluatePermission(owner, { action, context })).toBe(true)
      expect(evaluatePermission(other, { action, context })).toBe(false)
      expect(evaluatePermission(null, { action, context })).toBe(false)
      for (const facts of [
        { ...context, event: { ...event, organiserGroupId: "unrelated" } },
        { ...context, event: { ...event, organiserGroupId: null }, group: null },
        { ...context, group: { ...group, active: false } },
        { ...context, group: { ...group, type: GroupType.Choir } },
        { ...context, positionAppointments: [] },
        { ...context, positionAppointments: [{ ...holding, endDate: "2026-01-01" }] }
      ]) {
        expect(evaluatePermission(owner, { action, context: facts })).toBe(false)
        expect(evaluatePermission(admin, { action, context: facts })).toBe(true)
      }
      expect(evaluatePermission(admin, { action, context: { ...context, event: null } })).toBe(false)
    }
  })
})

describe("Board scheduling of Choirs' Series Rehearsals", () => {
  // `holding` makes owner a current Position holder in `group`, an active Board.
  const choir: GroupAttributes = { id: "choir", type: GroupType.Choir, active: true }
  const choirTarget = { groupId: choir.id, groupType: GroupType.Choir, voiceFamily: null }
  const rehearsal = { id: "rehearsal", organiserGroupId: choir.id, type: "Rehearsal" as const, seriesId: "series" }
  const choirContext = { group: choir, positionAppointments: [holding] }
  const context = {
    ...choirContext,
    groups: [group, choir],
    targets: [choirTarget],
    event: rehearsal,
    proposedOrganiser: choirContext,
    proposedEvent: { type: "Rehearsal" as const, targets: [choirTarget] }
  }
  const instanceActions = ["event.read", "event.update", "event.changeStatus", "event.delete"] as const

  test("the tool is for Admins and current Position holders in an active Board group", () => {
    const schedule = { groups: [group, choir], positionAppointments: [holding] }
    expect(evaluatePermission(owner, { action: "event.scheduleRehearsals", context: schedule })).toBe(true)
    expect(evaluatePermission(other, { action: "event.scheduleRehearsals", context: schedule })).toBe(false)
    expect(evaluatePermission(null, { action: "event.scheduleRehearsals", context: schedule })).toBe(false)
    for (const facts of [
      { ...schedule, groups: [{ ...group, active: false }, choir] },
      { ...schedule, groups: [{ ...group, type: GroupType.GigCommittee }, choir] },
      { ...schedule, positionAppointments: [{ ...holding, endDate: "2026-01-01" }] },
      { ...schedule, positionAppointments: [{ ...holding, contextGroupId: choir.id }] }
    ]) {
      expect(evaluatePermission(owner, { action: "event.scheduleRehearsals", context: facts })).toBe(false)
      expect(evaluatePermission(admin, { action: "event.scheduleRehearsals", context: facts })).toBe(true)
    }
  })

  test("the Board manages a Rehearsal in a Series whose only Target is one whole Choir", () => {
    for (const action of instanceActions) {
      expect(evaluatePermission(owner, { action, context })).toBe(true)
      expect(evaluatePermission(other, { action, context })).toBe(false)
      for (const facts of [
        { ...context, event: { ...rehearsal, seriesId: null } },
        { ...context, event: { ...rehearsal, type: "Gig" as const } },
        { ...context, targets: [] },
        { ...context, targets: [{ ...choirTarget, voiceFamily: "B" as const }] },
        { ...context, targets: [choirTarget, { ...choirTarget, groupId: "other-choir" }] },
        { ...context, targets: [{ ...choirTarget, groupType: GroupType.Section }] },
        { ...context, groups: [{ ...group, active: false }, choir] },
        { ...context, positionAppointments: [{ ...holding, endDate: "2026-01-01" }] }
      ]) {
        expect(evaluatePermission(owner, { action, context: facts })).toBe(false)
        expect(evaluatePermission(admin, { action, context: facts })).toBe(true)
      }
    }
  })

  test("a Board update must leave it a Choir's Series Rehearsal under the same organiser", () => {
    for (const facts of [
      { ...context, proposedOrganiser: { ...choirContext, group: { ...group, id: "foreign" } } },
      { ...context, proposedOrganiser: { ...choirContext, group: null } },
      { ...context, proposedEvent: { type: "Gig" as const, targets: [choirTarget] } },
      { ...context, proposedEvent: { type: "Rehearsal" as const, targets: [] } },
      {
        ...context,
        proposedEvent: { type: "Rehearsal" as const, targets: [{ ...choirTarget, voiceFamily: "S" as const }] }
      }
    ]) {
      expect(evaluatePermission(owner, { action: "event.update", context: facts })).toBe(false)
      expect(evaluatePermission(admin, { action: "event.update", context: facts })).toBe(true)
    }
  })
})

describe("member and administrative policies", () => {
  const member = { id: owner.userId, banned: false }

  test("active shared profiles are readable; email and edits remain self-only", () => {
    expect(evaluatePermission(other, { action: "member.read", context: { member } })).toBe(true)
    for (const action of ["member.readEmail", "member.editProfile"] as const) {
      expect(evaluatePermission(owner, { action, context: { member } })).toBe(true)
      expect(evaluatePermission(other, { action, context: { member } })).toBe(false)
      expect(evaluatePermission(admin, { action, context: { member } })).toBe(false)
    }
  })

  test("missing or inactive target profiles deny all member actions", () => {
    for (const resource of [null, { ...member, banned: true }]) {
      for (const action of ["member.read", "member.readEmail", "member.editProfile"] as const) {
        expect(evaluatePermission(owner, { action, context: { member: resource } })).toBe(false)
        expect(evaluatePermission(admin, { action, context: { member: resource } })).toBe(false)
      }
    }
  })

  test("administrative grants are explicit and unavailable to other actors", () => {
    for (const action of [
      "oidcClient.manage",
      "admin.access",
      "event.administer",
      "org.manage",
      "user.administer",
      "notification.broadcast"
    ] as const) {
      expect(evaluatePermission(owner, { action })).toBe(false)
      expect(evaluatePermission(admin, { action })).toBe(true)
      expect(evaluatePermission(null, { action })).toBe(false)
    }
  })
})

test("every action denies without an active actor, and unknown runtime actions deny", () => {
  const requests = [
    { action: "app.access" },
    { action: "post.create" },
    ...(["post.read", "post.update", "post.publish", "post.unpublish", "post.discard"] as const).map((action) => ({
      action,
      context: { post: post("published") }
    })),
    ...(
      [
        "group.publishPost",
        "group.manageContent",
        "group.manageEvents",
        "group.manageMemberships",
        "group.managePositions"
      ] as const
    ).map((action) => ({ action, context: groupContext })),
    ...(["member.read", "member.readEmail", "member.editProfile"] as const).map((action) => ({
      action,
      context: { member: { id: owner.userId, banned: false } }
    })),
    ...(["admin.access", "event.administer", "org.manage", "user.administer", "notification.broadcast"] as const).map(
      (action) => ({
        action
      })
    )
  ] satisfies PermissionRequest[]
  for (const request of requests) expect(evaluatePermission(null, request)).toBe(false)
  for (const action of ["unsupported", "constructor", "toString", "__proto__"]) {
    expect(evaluatePermission(admin, { action } as unknown as PermissionRequest)).toBe(false)
  }
})
