import { describe, expect, test } from "bun:test"
import type {
  AuthorizationActor,
  GroupAttributes,
  MembershipAttributes,
  PermissionContext,
  PermissionRequest,
  PositionHoldingAttributes,
  PostAttributes
} from "./model"
import { evaluatePermission } from "./policies"

const owner: AuthorizationActor = { userId: "owner", isAdmin: false, impersonatedBy: null }
const other: AuthorizationActor = { userId: "other", isAdmin: false, impersonatedBy: null }
const admin: AuthorizationActor = { userId: "admin", isAdmin: true, impersonatedBy: null }

function post(state: "draft" | "published" | "discarded", authorId: string | null = owner.userId): PostAttributes {
  return {
    id: "post",
    authorId,
    publishedAt: state === "published" ? new Date("2026-01-01") : null,
    discardedAt: state === "discarded" ? new Date("2026-01-01") : null
  }
}

const group: GroupAttributes = { id: "group", type: "Board", active: true }
const membership: MembershipAttributes = {
  groupId: group.id,
  userId: owner.userId,
  startDate: "2020-01-01",
  endDate: null
}
const holding: PositionHoldingAttributes = { ...membership, positionId: "position" }
const groupContext: PermissionContext["group.manageContent"] = {
  group,
  memberships: [membership],
  positionHoldings: [holding]
}

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
  test("Group work needs both a Membership and a Position holding for this actor in this exact Group", () => {
    for (const action of ["group.publishPost", "group.manageContent", "group.manageEvents"] as const) {
      expect(evaluatePermission(owner, { action, context: groupContext })).toBe(true)
      expect(evaluatePermission(other, { action, context: groupContext })).toBe(false)
      expect(evaluatePermission(owner, { action, context: { ...groupContext, memberships: [] } })).toBe(false)
      expect(evaluatePermission(owner, { action, context: { ...groupContext, positionHoldings: [] } })).toBe(false)
      expect(
        evaluatePermission(owner, { action, context: { ...groupContext, group: { ...group, id: "another-group" } } })
      ).toBe(false)
      expect(
        evaluatePermission(owner, {
          action,
          context: { ...groupContext, positionHoldings: [{ ...holding, userId: other.userId }] }
        })
      ).toBe(false)
      expect(
        evaluatePermission(owner, {
          action,
          context: { ...groupContext, memberships: [{ ...membership, userId: other.userId }] }
        })
      ).toBe(false)
    }
  })

  test("Choir work and Membership/Position administration require explicit Admin authority", () => {
    for (const action of ["group.publishPost", "group.manageContent", "group.manageEvents"] as const) {
      const context = { ...groupContext, group: { ...group, type: "Choir" as const } }
      expect(evaluatePermission(owner, { action, context })).toBe(false)
      expect(evaluatePermission(admin, { action, context })).toBe(true)
      expect(evaluatePermission(admin, { action, context: { group, memberships: [], positionHoldings: [] } })).toBe(
        true
      )
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

  test("periods retain the existing open-ended semantics for future start and end dates", () => {
    const context = {
      group,
      memberships: [{ ...membership, startDate: "2999-01-01" }],
      positionHoldings: [{ ...holding, startDate: "2999-01-01" }]
    }
    expect(evaluatePermission(owner, { action: "group.manageContent", context })).toBe(true)
    expect(
      evaluatePermission(owner, {
        action: "group.manageContent",
        context: { ...context, memberships: [{ ...membership, endDate: "2999-02-01" }] }
      })
    ).toBe(false)
    expect(
      evaluatePermission(owner, {
        action: "group.manageContent",
        context: { ...context, positionHoldings: [{ ...holding, endDate: "2999-02-01" }] }
      })
    ).toBe(false)
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

  test("support impersonation cannot edit the effective actor's profile or borrow Admin authority", () => {
    const support = { ...owner, impersonatedBy: admin.userId }
    expect(evaluatePermission(support, { action: "member.readEmail", context: { member } })).toBe(true)
    expect(evaluatePermission(support, { action: "member.editProfile", context: { member } })).toBe(false)
    expect(evaluatePermission(support, { action: "admin.access" })).toBe(false)
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
    for (const action of ["admin.access", "org.manage", "user.administer", "notification.broadcast"] as const) {
      expect(evaluatePermission(owner, { action })).toBe(false)
      expect(evaluatePermission(admin, { action })).toBe(true)
      expect(evaluatePermission(null, { action })).toBe(false)
    }
  })
})

test("every action denies without an active actor, and unknown runtime actions deny", () => {
  const requests = [
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
    ...(["admin.access", "org.manage", "user.administer", "notification.broadcast"] as const).map((action) => ({
      action
    }))
  ] satisfies PermissionRequest[]
  for (const request of requests) expect(evaluatePermission(null, request)).toBe(false)
  for (const action of ["unsupported", "constructor", "toString", "__proto__"]) {
    expect(evaluatePermission(admin, { action } as unknown as PermissionRequest)).toBe(false)
  }
})
