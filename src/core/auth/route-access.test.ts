import { describe, expect, test } from "bun:test"

import { getRouteAccessDecision } from "./route-access"

const userSession = { user: { id: "user-1", role: "user" } }
const adminSession = { user: { id: "admin-1", role: "admin" } }
const impersonatingSession = {
  user: { id: "member-1", role: "user" },
  session: { impersonatedBy: "admin-1" }
}

describe("route access", () => {
  test("keeps internal locale rewrites from turning login into a protected route", async () => {
    await expect(getRouteAccessDecision("/sv/login", null)).resolves.toEqual({ kind: "allow" })
    await expect(getRouteAccessDecision("/en/news/new", userSession)).resolves.toEqual({ kind: "allow" })
    await expect(getRouteAccessDecision("/de/admin/users", userSession)).resolves.toEqual({ kind: "forbidden" })
  })
  test("allows public routes without a session", async () => {
    await expect(getRouteAccessDecision("/forgot-password", null)).resolves.toEqual({ kind: "allow" })
    await expect(getRouteAccessDecision("/activation-failed", null)).resolves.toEqual({ kind: "allow" })
  })

  test("allows authenticated users to access user routes", async () => {
    await expect(getRouteAccessDecision("/me", userSession)).resolves.toEqual({ kind: "allow" })
  })

  test("keeps impersonated sessions out of messaging routes", async () => {
    await expect(getRouteAccessDecision("/messages", impersonatingSession)).resolves.toEqual({ kind: "forbidden" })
    await expect(getRouteAccessDecision("/messages/conversation-1", impersonatingSession)).resolves.toEqual({
      kind: "forbidden"
    })
    await expect(getRouteAccessDecision("/messages", userSession)).resolves.toEqual({ kind: "allow" })
  })

  test("reserves profile editing for the real member while allowing profile and settings reads", async () => {
    await expect(getRouteAccessDecision("/me/edit", impersonatingSession)).resolves.toEqual({ kind: "forbidden" })
    await expect(getRouteAccessDecision("/me/edit", userSession)).resolves.toEqual({ kind: "allow" })
    await expect(getRouteAccessDecision("/me/edit", null)).resolves.toEqual({
      kind: "redirect",
      location: "/login?returnTo=%2Fme%2Fedit"
    })
    await expect(getRouteAccessDecision("/me", impersonatingSession)).resolves.toEqual({ kind: "allow" })
    await expect(getRouteAccessDecision("/me/settings", impersonatingSession)).resolves.toEqual({ kind: "allow" })
  })

  test("redirects unauthenticated users to sign in with the requested path", async () => {
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

  test("redirects signed-in users away from authentication entry pages", async () => {
    await expect(getRouteAccessDecision("/login", userSession)).resolves.toEqual({ kind: "redirect", location: "/" })
    await expect(getRouteAccessDecision("/forgot-password", userSession)).resolves.toEqual({
      kind: "redirect",
      location: "/"
    })
    await expect(getRouteAccessDecision("/activation-failed", userSession)).resolves.toEqual({
      kind: "redirect",
      location: "/"
    })
    await expect(getRouteAccessDecision("/two-factor", userSession)).resolves.toEqual({
      kind: "redirect",
      location: "/"
    })
    await expect(getRouteAccessDecision("/reset-password", userSession)).resolves.toEqual({
      kind: "redirect",
      location: "/"
    })

    await expect(getRouteAccessDecision("/login", adminSession)).resolves.toEqual({
      kind: "redirect",
      location: "/admin"
    })
  })

  test("allows signed-in users to use a password reset link", async () => {
    await expect(
      getRouteAccessDecision("/reset-password", userSession, "/reset-password?token=valid-token")
    ).resolves.toEqual({
      kind: "allow"
    })
  })

  test("forbids users from admin routes when authorization fails", async () => {
    await expect(getRouteAccessDecision("/admin/users", userSession)).resolves.toEqual({ kind: "forbidden" })
  })

  test("lets ordinary signed-in Users reach personal Post composition", async () => {
    await expect(getRouteAccessDecision("/news/new", userSession)).resolves.toEqual({ kind: "allow" })
  })

  test("sends an unauthenticated visitor from the compose page to sign in", async () => {
    await expect(getRouteAccessDecision("/news/new", null)).resolves.toEqual({
      kind: "redirect",
      location: "/login?returnTo=%2Fnews%2Fnew"
    })
  })

  test("leaves reading the news feed open to every user", async () => {
    await expect(getRouteAccessDecision("/news", userSession)).resolves.toEqual({ kind: "allow" })
  })

  test("allows authorized users to access admin routes", async () => {
    await expect(getRouteAccessDecision("/admin/users", adminSession)).resolves.toEqual({ kind: "allow" })
  })
})
