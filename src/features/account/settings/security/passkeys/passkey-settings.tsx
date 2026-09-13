"use client"

import { getAuthenticatorName } from "@better-auth/passkey"
import { useCallback, useEffect, useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { useTranslations } from "@/core/i18n/translations"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { DeletePasskeyDialog } from "./delete-passkey-dialog"
import {
  addPasskey as addPasskeyOperation,
  deletePasskey as deletePasskeyOperation,
  renamePasskey as renamePasskeyOperation
} from "./passkey-service"

type Passkey = NonNullable<Awaited<ReturnType<typeof authClient.passkey.listUserPasskeys>>["data"]>[number]

export function PasskeySettings() {
  const t = useTranslations("AccountSettings")
  const common = useTranslations("Common")
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
      setMessage(t("passkeyAdded"))
      await loadPasskeys()
    } catch {
      setError(t("passkeyAddFailed"))
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
      setError(t("passkeyRenameFailed"))
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
      setError(t("passkeyDeleteFailed"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("passkeysTitle")}</CardTitle>
        <CardDescription>{t("passkeysDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPasskeys")}</p>
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
                      aria-label={t("passkeyName")}
                      autoFocus
                      required
                      disabled={pending}
                    />
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? t("saving") : common("save")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => setEditingPasskeyId(undefined)}
                    >
                      {common("cancel")}
                    </Button>
                  </form>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">
                        {passkey.name || getAuthenticatorName(passkey.aaguid) || t("passkey")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("added", {
                          date: passkey.createdAt ? new Date(passkey.createdAt).toLocaleDateString() : t("recently")
                        })}
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
                        {t("rename")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeletingPasskeyId(passkey.id)}
                        disabled={pending}
                      >
                        {common("delete")}
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
              <FieldLabel htmlFor="passkey-name">{t("newPasskeyName")}</FieldLabel>
              <Input
                id="passkey-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("passkeyPlaceholder")}
                disabled={pending}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? t("waitingForPasskey") : t("addPasskey")}
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
