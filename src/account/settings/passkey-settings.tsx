"use client"

import { getAuthenticatorName } from "@better-auth/passkey"
import { useCallback, useEffect, useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { DeletePasskeyDialog } from "./components/delete-passkey-dialog"
import {
  addPasskey as addPasskeyOperation,
  deletePasskey as deletePasskeyOperation,
  renamePasskey as renamePasskeyOperation
} from "./passkey-service"

type Passkey = NonNullable<Awaited<ReturnType<typeof authClient.passkey.listUserPasskeys>>["data"]>[number]

export function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [name, setName] = useState("")
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [pending, setPending] = useState(false)
  const [editingPasskeyId, setEditingPasskeyId] = useState<string>()
  const [editingName, setEditingName] = useState("")
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string>()

  const loadPasskeys = useCallback(async () => {
    const result = await authClient.passkey.listUserPasskeys()
    if (result.data) setPasskeys(result.data)
    if (result.error) setError(result.error.message)
  }, [])

  useEffect(() => {
    void loadPasskeys()
  }, [loadPasskeys])

  async function addPasskey(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError(undefined)
    setMessage(undefined)
    setPending(true)
    try {
      const result = await addPasskeyOperation(name)
      if (!result.success) {
        setError(result.error)
        return
      }
      setName("")
      setMessage("Passkey added.")
      await loadPasskeys()
    } catch {
      setError("Unable to add the passkey right now. Please try again.")
    } finally {
      setPending(false)
    }
  }

  async function renamePasskey(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingPasskeyId || pending) return
    setError(undefined)
    setPending(true)
    try {
      const result = await renamePasskeyOperation(editingPasskeyId, editingName)
      if (!result.success) {
        setError(result.error)
        return
      }
      setEditingPasskeyId(undefined)
      setEditingName("")
      await loadPasskeys()
    } catch {
      setError("Unable to rename the passkey right now. Please try again.")
    } finally {
      setPending(false)
    }
  }

  async function deletePasskey(id: string) {
    if (pending) return
    setError(undefined)
    setPending(true)
    try {
      const result = await deletePasskeyOperation(id)
      if (!result.success) {
        setError(result.error)
        return
      }
      setDeletingPasskeyId(undefined)
      await loadPasskeys()
    } catch {
      setError("Unable to delete the passkey right now. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>Use a device passkey to sign in without a password.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No passkeys registered.</p>
          ) : (
            passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3"
              >
                {editingPasskeyId === passkey.id ? (
                  <form onSubmit={renamePasskey} className="flex w-full flex-wrap gap-2">
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      aria-label="Passkey name"
                      autoFocus
                      required
                      disabled={pending}
                    />
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => setEditingPasskeyId(undefined)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">{passkey.name || getAuthenticatorName(passkey.aaguid) || "Passkey"}</p>
                      <p className="text-sm text-muted-foreground">
                        Added {passkey.createdAt ? new Date(passkey.createdAt).toLocaleDateString() : "recently"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingPasskeyId(passkey.id)
                          setEditingName(passkey.name ?? "")
                        }}
                        disabled={pending}
                      >
                        Rename
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeletingPasskeyId(passkey.id)}
                        disabled={pending}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
        <form onSubmit={addPasskey}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="passkey-name">New passkey name (optional)</FieldLabel>
              <Input
                id="passkey-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My laptop"
                disabled={pending}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Waiting for passkey..." : "Add passkey"}
            </Button>
          </FieldGroup>
        </form>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {message ? (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <DeletePasskeyDialog
          passkeyId={deletingPasskeyId}
          onClose={() => setDeletingPasskeyId(undefined)}
          onDelete={(id) => void deletePasskey(id)}
          pending={pending}
        />
      </CardContent>
    </Card>
  )
}
