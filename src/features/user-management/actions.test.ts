import { beforeEach, describe, expect, mock, test } from "bun:test"

const banUser = mock(async () => undefined)
const removeUser = mock(async () => undefined)
const setRole = mock(async () => undefined)
const signInMagicLink = mock(async () => undefined)
const impersonateUserApi = mock(async () => undefined)
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const requestHeaders = mock(async () => new Headers({ cookie: "session=admin" }))
const revalidatePath = mock(() => undefined)
const limit = mock(async () => [
  { id: "user-1", banned: false, email: "ada@example.com", emailVerified: false, hasPassword: false, name: "Ada" }
])
const where = mock(() => ({ limit }))
const from = mock(() => ({ where }))
const select = mock(() => ({ from }))

mock.module("@/core/auth/auth", () => ({
  auth: { api: { banUser, removeUser, setRole, signInMagicLink, impersonateUser: impersonateUserApi } }
}))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("@/core/db", () => ({ db: { select } }))
mock.module("next/headers", () => ({ headers: requestHeaders }))
mock.module("next/cache", () => ({ revalidatePath }))

import { changeUserRole, deactivateUser, eraseUser, impersonateUser, resendInvitation } from "./actions"

function formData(confirmation?: string) {
  const data = new FormData()
  data.set("userId", "user-1")
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
  impersonateUserApi.mockClear()
  requireAdmin.mockClear()
  requestHeaders.mockClear()
  revalidatePath.mockClear()
  limit.mockClear()
})

describe("user lifecycle commands", () => {
  test("authorizes and delegates deactivation to Better Auth, which revokes sessions", async () => {
    await expect(deactivateUser({ status: "idle" }, formData())).resolves.toEqual({
      status: "success",
      action: "deactivate"
    })

    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(banUser).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { userId: "user-1", banReason: "Deactivated by an admin" }
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

    await expect(deactivateUser({ status: "idle" }, formData())).resolves.toEqual({
      status: "error",
      error: "You cannot deactivate your own account."
    })
    await expect(eraseUser({ status: "idle" }, formData("delete Admin"))).resolves.toEqual({
      status: "error",
      error: "You cannot erase your own account."
    })
    expect(banUser).not.toHaveBeenCalled()
    expect(removeUser).not.toHaveBeenCalled()
  })

  test("refuses direct erasure calls without the confirmation phrase", async () => {
    limit.mockResolvedValue([
      { id: "user-1", banned: true, email: "ada@example.com", emailVerified: false, hasPassword: false, name: "Ada" }
    ])

    await expect(eraseUser({ status: "idle" }, formData())).resolves.toEqual({
      status: "error",
      error: "Type the deletion confirmation exactly to erase this user."
    })

    expect(requireAdmin).toHaveBeenCalledTimes(1)
    expect(removeUser).not.toHaveBeenCalled()
  })

  test("authorizes and delegates role changes to Better Auth", async () => {
    await expect(changeUserRole({ status: "idle" }, roleFormData("user", "admin"))).resolves.toEqual({
      status: "success",
      action: "role"
    })

    expect(setRole).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { userId: "user-1", role: ["user", "admin"] }
    })
  })

  test("adds user when assigning the admin role", async () => {
    await expect(changeUserRole({ status: "idle" }, roleFormData("admin"))).resolves.toEqual({
      status: "success",
      action: "role"
    })

    expect(setRole).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { userId: "user-1", role: ["user", "admin"] }
    })
  })

  test("refuses to demote the final active admin when another admin is inactive", async () => {
    limit.mockResolvedValue([
      {
        id: "user-1",
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

    await expect(changeUserRole({ status: "idle" }, roleFormData("user"))).resolves.toEqual({
      status: "error",
      error: "You cannot demote the final remaining admin."
    })
    expect(setRole).not.toHaveBeenCalled()
  })

  test("refuses an admin target for impersonation before calling Better Auth", async () => {
    limit.mockResolvedValue([
      {
        id: "user-1",
        banned: false,
        email: "admin@example.com",
        emailVerified: true,
        hasPassword: true,
        name: "Admin",
        role: "admin"
      }
    ] as never)

    await expect(impersonateUser("user-1")).resolves.toEqual({
      status: "error",
      error: "Admins cannot be impersonated."
    })
    expect(impersonateUserApi).not.toHaveBeenCalled()
  })

  test("resends an invitation until the user has set a password", async () => {
    limit.mockResolvedValue([
      { id: "user-1", banned: false, email: "ada@example.com", emailVerified: true, hasPassword: false, name: "Ada" }
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
