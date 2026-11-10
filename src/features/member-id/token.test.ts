import { describe, expect, test } from "bun:test"
import { evaluatePermission } from "@/core/authz/policy-registry"
import { issueMemberIdToken, readMemberIdToken } from "./token"

const secret = "disposable-test-secret-never-used-for-real-sessions"
const claims = { userId: "member-123", sessionId: "session-456", issuedAt: 100_000 }

describe("member ID tokens", () => {
  test("accepts both overlapping codes, rejecting each exactly at ten seconds", () => {
    const first = issueMemberIdToken(claims, secret)
    const second = issueMemberIdToken({ ...claims, issuedAt: 105_000 }, secret)
    expect(readMemberIdToken(first, secret, 109_999)).toEqual(claims)
    expect(readMemberIdToken(second, secret, 109_999)?.issuedAt).toBe(105_000)
    expect(readMemberIdToken(first, secret, 110_000)).toBeNull()
    expect(readMemberIdToken(second, secret, 115_000)).toBeNull()
    expect(readMemberIdToken(first, secret, 99_999)).toBeNull()
  })

  test("conceals identity, randomizes codes, and rejects forgery or another secret", () => {
    const token = issueMemberIdToken(claims, secret)
    expect(token).not.toContain(claims.userId)
    expect(token).not.toContain(claims.sessionId)
    expect(issueMemberIdToken(claims, secret)).not.toBe(token)
    expect(readMemberIdToken(token, "another-secret", 100_001)).toBeNull()
    const offset = 30
    const forged = token.slice(0, offset) + (token[offset] === "A" ? "B" : "A") + token.slice(offset + 1)
    expect(readMemberIdToken(forged, secret, 100_001)).toBeNull()
    for (const invalid of ["", "https://example.com", "csk-id:1:!", "csk-id:1:A", `${token} `, "A".repeat(3000)]) {
      expect(readMemberIdToken(invalid, secret, 100_001)).toBeNull()
    }
  })
})

test("ID policies deny anonymous, ordinary scanners and all support impersonation", () => {
  const member = { userId: "member", isAdmin: false, impersonatedBy: null }
  const admin = { ...member, isAdmin: true }
  expect(evaluatePermission(null, { action: "memberId.issue" })).toBe(false)
  expect(evaluatePermission(member, { action: "memberId.issue" })).toBe(true)
  expect(evaluatePermission(member, { action: "memberId.verify" })).toBe(false)
  expect(evaluatePermission(admin, { action: "memberId.verify" })).toBe(true)
  for (const actor of [member, admin]) {
    expect(evaluatePermission({ ...actor, impersonatedBy: "support" }, { action: "memberId.issue" })).toBe(false)
    expect(evaluatePermission({ ...actor, impersonatedBy: "support" }, { action: "memberId.verify" })).toBe(false)
  }
})
