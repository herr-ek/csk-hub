import { beforeEach, describe, expect, mock, test } from "bun:test"

const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "member-1" }))
const requireCurrentUserPermission = mock(async () => ({ state: "authenticated" as const, userId: "member-1" }))

mock.module("@/core/auth/permissions.server", () => ({ requireAdmin, requireCurrentUserPermission }))

import { getRouteAccessDecision } from "./route-access"

const memberSession = { user: { id: "member-1", role: "member" } }
const adminSession = { user: { id: "admin-1", role: "admin" } }

beforeEach(() => {
  requireAdmin.mockReset()
  requireAdmin.mockResolvedValue({ state: "authenticated", userId: "member-1" })
  requireCurrentUserPermission.mockReset()
  requireCurrentUserPermission.mockResolvedValue({ state: "authenticated", userId: "member-1" })
})

describe("route access", () => {
  test("allows public routes without a session", async () => {
    await expect(getRouteAccessDecision("/forgot-password", null)).resolves.toEqual({ kind: "allow" })
    await expect(getRouteAccessDecision("/activation-failed", null)).resolves.toEqual({ kind: "allow" })
    expect(requireAdmin).not.toHaveBeenCalled()
  })

  test("allows authenticated members to access member routes", async () => {
    await expect(getRouteAccessDecision("/me", memberSession)).resolves.toEqual({ kind: "allow" })
  })

  test("redirects unauthenticated members to sign in with the requested path", async () => {
    await expect(getRouteAccessDecision("/me", null)).resolves.toEqual({
      kind: "redirect",
      location: "/login?returnTo=%2Fme"
    })
  })

  test("protects activation until a magic link creates a session", async () => {
    await expect(getRouteAccessDecision("/activate", null)).resolves.toEqual({
      kind: "redirect",
      location: "/login?returnTo=%2Factivate"
    })
  })

  test("redirects signed-in members away from authentication entry pages", async () => {
    await expect(getRouteAccessDecision("/login", memberSession)).resolves.toEqual({ kind: "redirect", location: "/" })
    await expect(getRouteAccessDecision("/forgot-password", memberSession)).resolves.toEqual({
      kind: "redirect",
      location: "/"
    })
    await expect(getRouteAccessDecision("/activation-failed", memberSession)).resolves.toEqual({
      kind: "redirect",
      location: "/"
    })
    await expect(getRouteAccessDecision("/two-factor", memberSession)).resolves.toEqual({
      kind: "redirect",
      location: "/"
    })
    await expect(getRouteAccessDecision("/reset-password", memberSession)).resolves.toEqual({
      kind: "redirect",
      location: "/"
    })

    await expect(getRouteAccessDecision("/login", adminSession)).resolves.toEqual({
      kind: "redirect",
      location: "/admin"
    })
  })

  test("allows signed-in members to use a password reset link", async () => {
    await expect(
      getRouteAccessDecision("/reset-password", memberSession, "/reset-password?token=valid-token")
    ).resolves.toEqual({
      kind: "allow"
    })
  })

  test("forbids members from admin routes when authorization fails", async () => {
    requireAdmin.mockRejectedValue(new Error("not an admin"))

    await expect(getRouteAccessDecision("/admin/members", memberSession)).resolves.toEqual({ kind: "forbidden" })
    expect(requireAdmin).toHaveBeenCalledWith(memberSession)
  })

  test("keeps members without the post:create permission off the compose page", async () => {
    requireCurrentUserPermission.mockRejectedValue(new Error("not permitted"))

    await expect(getRouteAccessDecision("/news/new", memberSession)).resolves.toEqual({ kind: "forbidden" })
    expect(requireCurrentUserPermission).toHaveBeenCalledWith({ resource: "post", action: "create" }, memberSession)
    expect(requireAdmin).not.toHaveBeenCalled()
  })

  test("lets a member holding post:create reach the compose page", async () => {
    await expect(getRouteAccessDecision("/news/new", adminSession)).resolves.toEqual({ kind: "allow" })
    expect(requireCurrentUserPermission).toHaveBeenCalledWith({ resource: "post", action: "create" }, adminSession)
  })

  test("sends an unauthenticated visitor from the compose page to sign in", async () => {
    await expect(getRouteAccessDecision("/news/new", null)).resolves.toEqual({
      kind: "redirect",
      location: "/login?returnTo=%2Fnews%2Fnew"
    })
    expect(requireCurrentUserPermission).not.toHaveBeenCalled()
  })

  test("leaves reading the news feed open to every member", async () => {
    await expect(getRouteAccessDecision("/news", memberSession)).resolves.toEqual({ kind: "allow" })
    expect(requireCurrentUserPermission).not.toHaveBeenCalled()
  })

  test("allows authorized members to access admin routes", async () => {
    await expect(getRouteAccessDecision("/admin/members", adminSession)).resolves.toEqual({ kind: "allow" })
    expect(requireAdmin).toHaveBeenCalledWith(adminSession)
  })
})
