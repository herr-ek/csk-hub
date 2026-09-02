import { authClient } from "@/core/auth/auth-client"

export type PasskeyOperationResult = { success: true } | { success: false; error: string }

export async function addPasskey(name: string): Promise<PasskeyOperationResult> {
  const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined })
  return result.error
    ? { success: false, error: result.error.message ?? "Unable to register the passkey." }
    : { success: true }
}

export async function renamePasskey(id: string, name: string): Promise<PasskeyOperationResult> {
  const trimmedName = name.trim()
  if (!trimmedName) return { success: false, error: "Passkey name is required." }

  const result = await authClient.passkey.updatePasskey({ id, name: trimmedName })
  return result.error
    ? { success: false, error: result.error.message ?? "Unable to rename the passkey." }
    : { success: true }
}

export async function deletePasskey(id: string): Promise<PasskeyOperationResult> {
  const result = await authClient.passkey.deletePasskey({ id })
  return result.error
    ? { success: false, error: result.error.message ?? "Unable to delete the passkey." }
    : { success: true }
}
