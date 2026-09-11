import { beforeEach, describe, expect, mock, test } from "bun:test"

const addPasskeyEndpoint = mock(async () => ({ error: null as null | { message: string } }))
const updatePasskeyEndpoint = mock(async () => ({ error: null as null | { message: string } }))
const deletePasskeyEndpoint = mock(async () => ({ error: null as null | { message: string } }))

mock.module("@/core/auth/auth-client", () => ({
  authClient: {
    passkey: {
      addPasskey: addPasskeyEndpoint,
      updatePasskey: updatePasskeyEndpoint,
      deletePasskey: deletePasskeyEndpoint
    }
  }
}))

import { addPasskey, deletePasskey, renamePasskey } from "./passkey-service"

beforeEach(() => {
  addPasskeyEndpoint.mockReset()
  updatePasskeyEndpoint.mockReset()
  deletePasskeyEndpoint.mockReset()
})

describe("passkey settings", () => {
  test("adds a named passkey", async () => {
    addPasskeyEndpoint.mockResolvedValue({ error: null })

    await expect(addPasskey("Laptop")).resolves.toEqual({ success: true })
    expect(addPasskeyEndpoint).toHaveBeenCalledWith({ name: "Laptop" })
  })

  test("omits an empty passkey name", async () => {
    addPasskeyEndpoint.mockResolvedValue({ error: null })

    await expect(addPasskey("  ")).resolves.toEqual({ success: true })
    expect(addPasskeyEndpoint).toHaveBeenCalledWith({ name: undefined })
  })

  test("renames a passkey after trimming the name", async () => {
    updatePasskeyEndpoint.mockResolvedValue({ error: null })

    await expect(renamePasskey("passkey-1", "  Work laptop  ")).resolves.toEqual({ success: true })
    expect(updatePasskeyEndpoint).toHaveBeenCalledWith({ id: "passkey-1", name: "Work laptop" })
  })

  test("does not rename a passkey to an empty name", async () => {
    await expect(renamePasskey("passkey-1", "  ")).resolves.toEqual({
      success: false,
      error: "Passkey name is required."
    })
    expect(updatePasskeyEndpoint).not.toHaveBeenCalled()
  })

  test("deletes a passkey", async () => {
    deletePasskeyEndpoint.mockResolvedValue({ error: null })

    await expect(deletePasskey("passkey-1")).resolves.toEqual({ success: true })
    expect(deletePasskeyEndpoint).toHaveBeenCalledWith({ id: "passkey-1" })
  })

  test("returns passkey operation errors", async () => {
    addPasskeyEndpoint.mockResolvedValue({ error: { message: "Passkey registration failed." } })

    await expect(addPasskey("Laptop")).resolves.toEqual({
      success: false,
      error: "Passkey registration failed."
    })
  })
})
