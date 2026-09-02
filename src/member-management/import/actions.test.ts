import { beforeEach, describe, expect, mock, test } from "bun:test"

const createUser = mock(async () => undefined)
const signInMagicLink = mock(async () => undefined)
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const requestHeaders = mock(async () => new Headers({ cookie: "session=admin" }))
const revalidatePath = mock(() => undefined)
const loggerError = mock(() => undefined)
const loggerWarn = mock(() => undefined)

mock.module("@/core/auth/auth", () => ({ auth: { api: { createUser, signInMagicLink } } }))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("@/core/logging", () => ({ logger: { error: loggerError, warn: loggerWarn } }))
mock.module("next/headers", () => ({ headers: requestHeaders }))
mock.module("next/cache", () => ({ revalidatePath }))

import { importMembers } from "./actions"
import { MAX_IMPORT_FILE_SIZE_BYTES } from "./schemas"

function importFormData() {
  const formData = new FormData()
  formData.set("file", new File(["name,email\nAda Lovelace,ada@example.com"], "members.csv", { type: "text/csv" }))
  return formData
}

beforeEach(() => {
  createUser.mockReset()
  createUser.mockResolvedValue(undefined)
  signInMagicLink.mockReset()
  signInMagicLink.mockResolvedValue(undefined)
  requireAdmin.mockClear()
  requestHeaders.mockClear()
  revalidatePath.mockClear()
  loggerError.mockClear()
  loggerWarn.mockClear()
})

describe("member import", () => {
  test("reports members created when invite delivery fails", async () => {
    signInMagicLink.mockRejectedValue(new Error("smtp unavailable"))

    await expect(importMembers({ status: "idle" }, importFormData())).resolves.toEqual({
      status: "success",
      created: [],
      emailFailed: [{ row: 2, name: "Ada Lovelace", email: "ada@example.com" }],
      failed: [],
      skipped: []
    })

    expect(revalidatePath).toHaveBeenCalledTimes(1)
  })

  test("rejects files larger than the import limit before parsing them", async () => {
    const formData = new FormData()
    formData.set("file", new File([new Uint8Array(MAX_IMPORT_FILE_SIZE_BYTES + 1)], "members.csv"))

    await expect(importMembers({ status: "idle" }, formData)).resolves.toEqual({
      status: "error",
      error: "The CSV must be 1 MB or smaller."
    })

    expect(createUser).not.toHaveBeenCalled()
  })
})
