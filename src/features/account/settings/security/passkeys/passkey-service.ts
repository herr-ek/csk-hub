import { authClient } from "@/core/auth/auth-client"

export type PasskeyOperationError = "addFailed" | "nameRequired" | "renameFailed" | "deleteFailed"
export type PasskeyOperationResult = { success: true } | { success: false; error: PasskeyOperationError }

export async function addPasskey(name: string): Promise<PasskeyOperationResult> {
  const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined })
  return result.error ? { success: false, error: "addFailed" } : { success: true }
}

export async function renamePasskey(id: string, name: string): Promise<PasskeyOperationResult> {
  const trimmedName = name.trim()
  if (!trimmedName) return { success: false, error: "nameRequired" }

  const result = await authClient.passkey.updatePasskey({ id, name: trimmedName })
  return result.error ? { success: false, error: "renameFailed" } : { success: true }
}

export async function deletePasskey(id: string): Promise<PasskeyOperationResult> {
  const result = await authClient.passkey.deletePasskey({ id })
  return result.error ? { success: false, error: "deleteFailed" } : { success: true }
}
