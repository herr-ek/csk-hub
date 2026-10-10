"use client"

import { getAuthenticatorName } from "@better-auth/passkey"
import { useState } from "react"
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

type PendingOperation = "add" | "rename" | "delete"
type Feedback = { type: "error" | "success"; message: string }

export function PasskeySettings() {
  const t = useTranslations("AccountSettings")
  const common = useTranslations("Common")
  const {
    data: listedPasskeys,
    isPending: isLoadingPasskeys,
    error: passkeyLoadError,
    refetch
  } = authClient.useListPasskeys()
  const passkeys = listedPasskeys ?? []
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pending, setPending] = useState<PendingOperation | null>(null)
  const [editingPasskeyId, setEditingPasskeyId] = useState<string>()
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string>()

  async function addPasskey(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending !== null) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const name = String(formData.get("name") ?? "")
    setFeedback(null)
    setPending("add")
    try {
      const result = await addPasskeyOperation(name)
      if (!result.success) {
        setFeedback({ type: "error", message: result.error })
        return
      }
      form.reset()
      setFeedback({ type: "success", message: t("passkeyAdded") })
    } catch {
      setFeedback({ type: "error", message: t("passkeyAddFailed") })
    } finally {
      setPending(null)
    }
  }

  async function renamePasskey(event: React.SubmitEvent<HTMLFormElement>, id: string) {
    event.preventDefault()
    if (pending !== null) return
    const formData = new FormData(event.currentTarget)
    const newName = String(formData.get("name") ?? "")
    setFeedback(null)
    setPending("rename")
    try {
      const result = await renamePasskeyOperation(id, newName)
      if (!result.success) {
        setFeedback({ type: "error", message: result.error })
        return
      }
      setEditingPasskeyId(undefined)
    } catch {
      setFeedback({ type: "error", message: t("passkeyRenameFailed") })
    } finally {
      setPending(null)
    }
  }

  async function deletePasskey(id: string) {
    if (pending !== null) return
    setFeedback(null)
    setPending("delete")
    try {
      const result = await deletePasskeyOperation(id)
      if (!result.success) {
        setFeedback({ type: "error", message: result.error })
        return
      }
      setDeletingPasskeyId(undefined)
    } catch {
      setFeedback({ type: "error", message: t("passkeyDeleteFailed") })
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("passkeysTitle")}</CardTitle>
        <CardDescription>{t("passkeysDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3" aria-busy={isLoadingPasskeys}>
          {isLoadingPasskeys ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("loadingPasskeys")}
            </p>
          ) : null}
          {passkeyLoadError ? (
            <div className="flex flex-col items-start gap-2">
              <Alert variant="destructive">
                <AlertDescription>{t("passkeysLoadFailed")}</AlertDescription>
              </Alert>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isLoadingPasskeys}
              >
                {t("retryPasskeys")}
              </Button>
            </div>
          ) : null}
          {!isLoadingPasskeys && !passkeyLoadError && passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPasskeys")}</p>
          ) : null}
          {passkeys.map((passkey) => (
            <div key={passkey.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
              {editingPasskeyId === passkey.id ? (
                <form
                  onSubmit={(event) => void renamePasskey(event, passkey.id)}
                  className="flex w-full flex-wrap gap-2"
                >
                  <Input
                    name="name"
                    defaultValue={passkey.name ?? ""}
                    aria-label={t("passkeyName")}
                    autoFocus
                    required
                    disabled={pending !== null}
                  />
                  <Button type="submit" size="sm" disabled={pending !== null}>
                    {pending === "rename" ? t("saving") : common("save")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending !== null}
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
                      onClick={() => setEditingPasskeyId(passkey.id)}
                      disabled={pending !== null}
                    >
                      {t("rename")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeletingPasskeyId(passkey.id)}
                      disabled={pending !== null}
                    >
                      {common("delete")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={addPasskey}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="passkey-name">{t("newPasskeyName")}</FieldLabel>
              <Input id="passkey-name" name="name" placeholder={t("passkeyPlaceholder")} disabled={pending !== null} />
            </Field>
            <Button type="submit" disabled={pending !== null}>
              {pending === "add" ? t("waitingForPasskey") : t("addPasskey")}
            </Button>
          </FieldGroup>
        </form>
        {feedback ? (
          <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}
        <DeletePasskeyDialog
          passkeyId={deletingPasskeyId}
          onClose={() => setDeletingPasskeyId(undefined)}
          onDelete={(id) => void deletePasskey(id)}
          pending={pending === "delete"}
        />
      </CardContent>
    </Card>
  )
}
