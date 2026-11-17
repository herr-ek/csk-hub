import { describe, expect, test } from "bun:test"
import type {
  AuthorizationActor,
  PermissionContext,
  PostAddress,
  PostAttributes,
  PostAudienceTarget,
  PostGroupAttributes,
  PostRelationships
} from "./model"
import { evaluatePermission } from "./policy-registry"

const alice: AuthorizationActor = { userId: "alice", isAdmin: false }
const bob: AuthorizationActor = { userId: "bob", isAdmin: false }
const admin: AuthorizationActor = { userId: "admin", isAdmin: true }
const groups: PostGroupAttributes[] = [
  { id: "KK", type: "Choir", active: true, choirId: null },
  { id: "MK", type: "Choir", active: true, choirId: null },
  { id: "KKS", type: "Section", active: true, choirId: "KK" },
  { id: "MKS", type: "Section", active: true, choirId: "MK" },
  { id: "csk-group", type: "Övrig", active: true, choirId: null },
  { id: "committee", type: "Övrig", active: true, choirId: "KK" }
]
function relationships(actor = alice, memberships = ["KK", "csk-group"], holdings = ["csk-group"]): PostRelationships {
  return {
    groups,
    memberships: memberships.map((groupId) => ({
      userId: actor.userId,
      groupId,
      voice: null,
      startDate: "2026-01-01",
      endDate: null
    })),
    positionHoldings: holdings.map((groupId) => ({
      userId: actor.userId,
      groupId,
      positionId: "position",
      startDate: "2026-01-01",
      endDate: null
    }))
  }
}
function resource(overrides: Partial<PostAttributes> = {}): PostAttributes {
  return {
    id: "post",
    authorId: alice.userId,
    publisherGroupId: "csk-group",
    publishedAt: new Date(),
    firstPublishedAt: new Date(),
    audienceAll: false,
    discardedAt: null,
    ...overrides
  }
}
function address(
  proposed: Partial<PostAddress>,
  context: Partial<PermissionContext["post.address"]> = {},
  actor = alice
) {
  return evaluatePermission(actor, {
    action: "post.address",
    context: {
      post: null,
      relationships: relationships(actor),
      proposed: { publisherGroupId: null, audienceAll: false, targets: [], ...proposed },
      publishing: true,
      ...context
    }
  })
}

describe("Post publisher and audience policies", () => {
  test("cross-Choir authority follows the selected CSK-wide publisher, never a personal post or another group", () => {
    expect(address({ targets: [{ groupId: "MK", voiceFamily: null }] })).toBe(false)
    expect(address({ publisherGroupId: "csk-group", targets: [{ groupId: "MK", voiceFamily: null }] })).toBe(true)
    expect(address({ publisherGroupId: "csk-group", targets: [{ groupId: "MKS", voiceFamily: null }] })).toBe(false)
    expect(
      address(
        { publisherGroupId: "committee", targets: [{ groupId: "MK", voiceFamily: null }] },
        { relationships: relationships(alice, ["csk-group", "committee"], ["csk-group", "committee"]) }
      )
    ).toBe(false)
  })
  test("Choir membership permits any of its Sections, but no other Choir's Sections or committees", () => {
    expect(address({ targets: [{ groupId: "KKS", voiceFamily: null }] })).toBe(true)
    expect(address({ targets: [{ groupId: "MKS", voiceFamily: null }] })).toBe(false)
    expect(address({ targets: [{ groupId: "committee", voiceFamily: null }] })).toBe(false)
    expect(
      address({
        targets: [
          { groupId: "KKS", voiceFamily: null },
          { groupId: "MKS", voiceFamily: null }
        ]
      })
    ).toBe(false)
  })
  test("every active Member may select all CSK; publication requires an explicit audience", () => {
    expect(address({ audienceAll: true }, { relationships: relationships(alice, [], []) })).toBe(true)
    expect(address({})).toBe(false)
    expect(address({}, { publishing: false })).toBe(true)
    expect(address({ audienceAll: true, targets: [{ groupId: "KK", voiceFamily: null }] })).toBe(false)
  })
  test("representation requires membership and a position in the exact group", () => {
    for (const facts of [
      relationships(alice, [], ["csk-group"]),
      relationships(alice, ["csk-group"], []),
      relationships(alice, ["KK"], ["KK"])
    ]) {
      expect(address({ publisherGroupId: "csk-group", audienceAll: true }, { relationships: facts })).toBe(false)
    }
    expect(address({ publisherGroupId: "KK", audienceAll: true }, {}, admin)).toBe(false)
    expect(
      address(
        { publisherGroupId: "csk-group", targets: [{ groupId: "MKS", voiceFamily: null }] },
        { relationships: relationships(admin, [], []) },
        admin
      )
    ).toBe(true)
  })
  test("shared editing follows handover, not original authorship or audience membership", () => {
    const post = resource()
    expect(
      evaluatePermission(alice, {
        action: "post.update",
        context: { post, relationships: relationships(alice, ["KK"], []) }
      })
    ).toBe(false)
    expect(
      evaluatePermission(bob, {
        action: "post.update",
        context: { post, relationships: relationships(bob, ["csk-group"], ["csk-group"]) }
      })
    ).toBe(true)
    const personal = resource({ publisherGroupId: null })
    expect(
      evaluatePermission(bob, {
        action: "post.update",
        context: { post: personal, relationships: relationships(bob, ["csk-group"], ["csk-group"]) }
      })
    ).toBe(false)
  })
  test("private drafts stay private, while recalled group posts remain manageable", () => {
    const draft = resource({ firstPublishedAt: null, publishedAt: null })
    for (const actor of [bob, admin])
      expect(
        evaluatePermission(actor, {
          action: "post.read",
          context: { post: draft, relationships: relationships(actor) }
        })
      ).toBe(false)
    expect(evaluatePermission(alice, { action: "post.update", context: { post: draft } })).toBe(true)
    const recalled = resource({ publishedAt: null })
    for (const action of ["post.read", "post.update", "post.publish", "post.discard"] as const)
      expect(evaluatePermission(bob, { action, context: { post: recalled, relationships: relationships(bob) } })).toBe(
        true
      )
  })
  test("ordinary readership uses exact audience membership, with explicit personal-author and group-manager grants", () => {
    const context = {
      post: resource(),
      targets: [{ groupId: "KKS", voiceFamily: null }],
      relationships: relationships(alice, ["KK"], [])
    }
    expect(evaluatePermission(alice, { action: "post.read", context })).toBe(false)
    expect(
      evaluatePermission(alice, {
        action: "post.read",
        context: { ...context, post: resource({ publisherGroupId: null }) }
      })
    ).toBe(true)
    expect(
      evaluatePermission(bob, {
        action: "post.read",
        context: { ...context, relationships: relationships(bob, ["KKS"], []) }
      })
    ).toBe(true)
    expect(
      evaluatePermission(bob, { action: "post.read", context: { ...context, relationships: relationships(bob) } })
    ).toBe(true)
    expect(evaluatePermission(admin, { action: "post.read", context })).toBe(true)
  })
  test("identity is fixed at first publication, including recalled personal posts", () => {
    expect(
      address({ publisherGroupId: null, audienceAll: true }, { post: resource(), relationships: relationships() })
    ).toBe(false)
    expect(
      address(
        { publisherGroupId: "csk-group", audienceAll: true },
        { post: resource({ publisherGroupId: null, publishedAt: null }) }
      )
    ).toBe(false)
  })
  test("unchanged audiences survive departure for text edits; republication revalidates them", () => {
    const context = {
      post: resource({ publisherGroupId: null }),
      targets: [{ groupId: "MK", voiceFamily: null }],
      relationships: relationships(alice, [], [])
    }
    expect(address({ targets: [{ groupId: "MK", voiceFamily: null }] }, { ...context, publishing: false })).toBe(true)
    expect(address({ targets: [{ groupId: "MK", voiceFamily: null }] }, context)).toBe(false)
  })
  test("archived targets preserve historical reading but cannot be selected or republished", () => {
    const facts = { ...relationships(bob, ["KKS"], []), groups: groups.map((g) => ({ ...g, active: false })) }
    expect(
      evaluatePermission(bob, {
        action: "post.read",
        context: { post: resource(), targets: [{ groupId: "KKS", voiceFamily: null }], relationships: facts }
      })
    ).toBe(true)
    expect(address({ targets: [{ groupId: "KKS", voiceFamily: null }] }, { relationships: facts }, admin)).toBe(false)
    expect(address({ publisherGroupId: "csk-group", audienceAll: true }, { relationships: facts }, admin)).toBe(false)
    expect(
      evaluatePermission(admin, { action: "post.update", context: { post: resource(), relationships: facts } })
    ).toBe(true)
    expect(
      evaluatePermission(admin, {
        action: "post.publish",
        context: { post: resource({ publishedAt: null }), relationships: facts }
      })
    ).toBe(false)
  })
})

describe("Post Group/Voice-family audiences", () => {
  const bassGroups: PostGroupAttributes[] = [
    ...groups,
    { id: "KKB", type: "Section", active: true, choirId: "KK" },
    { id: "MKB", type: "Section", active: true, choirId: "MK" }
  ]
  const facts: PostRelationships = {
    ...relationships(bob, ["KK", "KKB", "committee"], []),
    groups: bassGroups,
    memberships: relationships(bob, ["KK", "KKB", "committee"], []).memberships.map((m) => ({
      ...m,
      voice: m.groupId === "KKB" ? "B2" : null
    }))
  }
  const read = (targets: PostAudienceTarget[], relationships = facts) =>
    evaluatePermission(bob, {
      action: "post.read",
      context: { post: resource(), relationships, targets }
    })
  test("CSK-wide family targets match current Section voices, independently of publisher", () => {
    expect(read([{ groupId: null, voiceFamily: "B" }])).toBe(true)
    expect(read([{ groupId: null, voiceFamily: "S" }])).toBe(false)
    expect(
      read([{ groupId: null, voiceFamily: "B" }], {
        ...facts,
        memberships: facts.memberships.map((m) => ({ ...m, endDate: "2026-11-17" }))
      })
    ).toBe(false)
    expect(
      read([{ groupId: null, voiceFamily: "B" }], {
        ...facts,
        memberships: facts.memberships.map((m) => ({ ...m, userId: "other" }))
      })
    ).toBe(false)
    expect(
      read([{ groupId: null, voiceFamily: "B" }], {
        ...facts,
        memberships: facts.memberships.map((m) => ({ ...m, voice: null }))
      })
    ).toBe(false)
  })
  test("Group and Voice are AND'ed, targets are OR'ed, and Choir/Section scope is exact", () => {
    for (const groupId of ["KK", "KKB", "committee"]) expect(read([{ groupId, voiceFamily: "B" }])).toBe(true)
    expect(read([{ groupId: "MK", voiceFamily: "B" }])).toBe(false)
    const crossChoir = {
      ...facts,
      memberships: [
        ...facts.memberships.filter((m) => m.groupId !== "KKB"),
        { userId: bob.userId, groupId: "MKB", voice: "B1" as const, startDate: "2026-01-01", endDate: null }
      ]
    }
    expect(read([{ groupId: "KK", voiceFamily: "B" }], crossChoir)).toBe(false)
    expect(read([{ groupId: "KKS", voiceFamily: "B" }])).toBe(false)
    expect(
      read([
        { groupId: "MK", voiceFamily: null },
        { groupId: null, voiceFamily: "B" }
      ])
    ).toBe(true)
    expect(read([])).toBe(false)
    expect(read([{ groupId: null, voiceFamily: null }])).toBe(false)
  })
  test("Voice filters narrow existing selection authority; Voice-only targets are available to everyone", () => {
    expect(
      address({ targets: [{ groupId: null, voiceFamily: "B" }] }, { relationships: relationships(alice, [], []) })
    ).toBe(true)
    expect(address({ targets: [{ groupId: "KK", voiceFamily: "B" }] })).toBe(true)
    expect(address({ targets: [{ groupId: "MK", voiceFamily: "B" }] })).toBe(false)
    expect(address({ publisherGroupId: "csk-group", targets: [{ groupId: "MK", voiceFamily: "B" }] })).toBe(true)
    expect(address({ targets: [{ groupId: null, voiceFamily: null }] })).toBe(false)
  })
  test("changing only the Voice filter revalidates the destination", () => {
    const context = {
      post: resource({ publisherGroupId: null }),
      relationships: relationships(alice, [], []),
      targets: [{ groupId: "MK", voiceFamily: "B" as const }],
      publishing: false
    }
    expect(address({ targets: [{ groupId: "MK", voiceFamily: "B" }] }, context)).toBe(true)
    expect(address({ targets: [{ groupId: "MK", voiceFamily: "S" }] }, context)).toBe(false)
  })
})

describe("Board audience selection", () => {
  test("current active Board representatives may select any active Group, independent of publisher", () => {
    const facts: PostRelationships = {
      ...relationships(alice, ["active-board"], ["active-board"]),
      groups: [...groups, { id: "active-board", type: "Board", active: true, choirId: null }]
    }
    for (const groupId of ["MK", "MKS", "committee"]) {
      expect(address({ targets: [{ groupId, voiceFamily: "B" }] }, { relationships: facts })).toBe(true)
    }
    expect(address({ publisherGroupId: "committee", audienceAll: true }, { relationships: facts })).toBe(false)
    for (const changed of [
      { ...facts, groups: facts.groups.map((g) => (g.id === "active-board" ? { ...g, active: false } : g)) },
      { ...facts, memberships: [] },
      { ...facts, positionHoldings: [] },
      { ...facts, positionHoldings: facts.positionHoldings.map((p) => ({ ...p, endDate: "2026-11-17" })) }
    ])
      expect(address({ targets: [{ groupId: "MKS", voiceFamily: null }] }, { relationships: changed })).toBe(false)
    expect(
      address(
        { targets: [{ groupId: "MKS", voiceFamily: null }] },
        { relationships: { ...facts, groups: facts.groups.map((g) => (g.id === "MKS" ? { ...g, active: false } : g)) } }
      )
    ).toBe(false)
  })
})

describe("Post attribution privacy", () => {
  const post = resource({ audienceAll: true })
  test("Group creators and audience members need current publishing authority to see attribution", () => {
    for (const actor of [alice, bob])
      expect(
        evaluatePermission(actor, {
          action: "post.readAttribution",
          context: { post, relationships: relationships(actor, ["KK"], []) }
        })
      ).toBe(false)
    expect(
      evaluatePermission(bob, { action: "post.readAttribution", context: { post, relationships: relationships(bob) } })
    ).toBe(true)
    expect(evaluatePermission(admin, { action: "post.readAttribution", context: { post } })).toBe(true)
    expect(
      evaluatePermission(bob, {
        action: "post.readAttribution",
        context: { post: { ...post, publisherGroupId: null }, relationships: relationships(bob, [], []) }
      })
    ).toBe(true)
  })
  test("missing resources and private Drafts stay protected, and archival removes representative access", () => {
    expect(evaluatePermission(admin, { action: "post.readAttribution", context: { post: null } })).toBe(false)
    expect(
      evaluatePermission(admin, {
        action: "post.readAttribution",
        context: { post: resource({ firstPublishedAt: null, publishedAt: null }) }
      })
    ).toBe(false)
    const archived = { ...relationships(bob), groups: groups.map((group) => ({ ...group, active: false })) }
    expect(
      evaluatePermission(bob, { action: "post.readAttribution", context: { post, relationships: archived } })
    ).toBe(false)
    expect(
      evaluatePermission(admin, { action: "post.readAttribution", context: { post, relationships: archived } })
    ).toBe(true)
  })
})
