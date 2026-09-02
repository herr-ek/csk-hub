import { beforeEach, describe, expect, mock, test } from "bun:test"

const banUser = mock(async () => undefined)
const removeUser = mock(async () => undefined)
const setRole = mock(async () => undefined)
const signInMagicLink = mock(async () => undefined)
const impersonateUser = mock(async () => undefined)
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const requestHeaders = mock(async () => new Headers({ cookie: "session=admin" }))
const revalidatePath = mock(() => undefined)
const limit = mock(async () => [
  { id: "member-1", banned: false, email: "ada@example.com", emailVerified: false, hasPassword: false, name: "Ada" }
])
const where = mock(() => ({ limit }))
const from = mock(() => ({ where }))
const select = mock(() => ({ from }))

mock.module("@/core/auth/auth", () => ({
  auth: { api: { banUser, removeUser, setRole, signInMagicLink, impersonateUser } }
}))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("@/core/db", () => ({ db: { select } }))
mock.module("next/headers", () => ({ headers: requestHeaders }))
mock.module("next/cache", () => ({ revalidatePath }))

import { changeMemberRole, deactivateMember, eraseMember, impersonateMember, resendInvitation } from "./actions"

function formData(confirmation?: string) {
  const data = new FormData()
  data.set("userId", "member-1")
  if (confirmation) data.set("confirmation", confirmation)
  return data
}

function roleFormData(...roles: string[]) {
  const data = formData()
  for (const role of roles) data.append("roles", role)
  return data
}

beforeEach(() => {
  banUser.mockClear()
  removeUser.mockClear()
  setRole.mockClear()
  signInMagicLink.mockClear()
  impersonateUser.mockClear()
  requireAdmin.mockClear()
  requestHeaders.mockClear()
  revalidatePath.mockClear()
  limit.mockClear()
})

describe("member lifecycle commands", () => {
  test("authorizes and delegates deactivation to Better Auth, which revokes sessions", async () => {
    await expect(deactivateMember({ status: "idle" }, formData())).resolves.toEqual({
      status: "success",
      action: "deactivate"
    })

    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(banUser).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { userId: "member-1", banReason: "Deactivated by an admin" }
    })
  })

  test("refuses an admin's direct attempt to deactivate or erase themselves", async () => {
    limit.mockResolvedValue([
      {
        id: "admin-1",
        banned: false,
        email: "admin@example.com",
        emailVerified: true,
        hasPassword: true,
        name: "Admin"
      }
    ])

    await expect(deactivateMember({ status: "idle" }, formData())).resolves.toEqual({
      status: "error",
      error: "You cannot deactivate your own account."
    })
    await expect(eraseMember({ status: "idle" }, formData("delete Admin"))).resolves.toEqual({
      status: "error",
      error: "You cannot erase your own account."
    })
    expect(banUser).not.toHaveBeenCalled()
    expect(removeUser).not.toHaveBeenCalled()
  })

  test("refuses direct erasure calls without the confirmation phrase", async () => {
    limit.mockResolvedValue([
      { id: "member-1", banned: true, email: "ada@example.com", emailVerified: false, hasPassword: false, name: "Ada" }
    ])

    await expect(eraseMember({ status: "idle" }, formData())).resolves.toEqual({
      status: "error",
      error: "Type the deletion confirmation exactly to erase this member."
    })

    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(removeUser).not.toHaveBeenCalled()
  })

  test("authorizes and delegates role changes to Better Auth", async () => {
    await expect(changeMemberRole({ status: "idle" }, roleFormData("member", "admin"))).resolves.toEqual({
      status: "success",
      action: "role"
    })

    expect(setRole).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { userId: "member-1", role: ["member", "admin"] }
    })
  })

  test("adds member when assigning the admin role", async () => {
    await expect(changeMemberRole({ status: "idle" }, roleFormData("admin"))).resolves.toEqual({
      status: "success",
      action: "role"
    })

    expect(setRole).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { userId: "member-1", role: ["member", "admin"] }
    })
  })

  test("refuses to demote the final active admin when another admin is inactive", async () => {
    limit.mockResolvedValue([
      {
        id: "member-1",
        banned: false,
        email: "admin@example.com",
        emailVerified: true,
        hasPassword: true,
        name: "Admin",
        role: "admin"
      }
    ] as never)
    select.mockImplementationOnce((() => ({ from })) as never)
    select.mockImplementationOnce((() => ({ from })) as never)
    select.mockImplementationOnce((() => ({
      from: () => ({ where: async () => [{ role: "admin" }] })
    })) as never)

    await expect(changeMemberRole({ status: "idle" }, roleFormData("member"))).resolves.toEqual({
      status: "error",
      error: "You cannot demote the final remaining admin."
    })
    expect(setRole).not.toHaveBeenCalled()
  })

  test("refuses an admin target for impersonation before calling Better Auth", async () => {
    limit.mockResolvedValue([
      {
        id: "member-1",
        banned: false,
        email: "admin@example.com",
        emailVerified: true,
        hasPassword: true,
        name: "Admin",
        role: "admin"
      }
    ] as never)

    await expect(impersonateMember("member-1")).resolves.toEqual({
      status: "error",
      error: "Admins cannot be impersonated."
    })
    expect(impersonateUser).not.toHaveBeenCalled()
  })

  test("resends an invitation until the member has set a password", async () => {
    limit.mockResolvedValue([
      { id: "member-1", banned: false, email: "ada@example.com", emailVerified: true, hasPassword: false, name: "Ada" }
    ])

    await expect(resendInvitation({ status: "idle" }, formData())).resolves.toEqual({
      status: "success",
      action: "invite"
    })
    expect(signInMagicLink).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {
        email: "ada@example.com",
        name: "Ada",
        callbackURL: "/activate",
        errorCallbackURL: "/activation-failed"
      }
    })
  })
})
