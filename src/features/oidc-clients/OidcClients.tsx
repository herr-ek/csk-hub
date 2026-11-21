"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/base/dialog"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Textarea } from "@/shared/ui/base/textarea"
import { updateOidcClient } from "./actions"
import type { ClientCommand, OidcClient } from "./clients.server"

export function OidcClients({ clients }: { clients: OidcClient[] }) {
  const t = useTranslations("OidcClients")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const [editor, setEditor] = useState<OidcClient | "create">()
  const [rotation, setRotation] = useState<OidcClient>()
  const [credentials, setCredentials] = useState<{ clientId: string; secret?: string }>()

  function run(command: ClientCommand) {
    setError(false)
    startTransition(async () => {
      try {
        const result = await updateOidcClient(command)
        if (!result.success) {
          setError(true)
          return
        }
        setEditor(undefined)
        setRotation(undefined)
        setCredentials(result.credentials)
      } catch {
        setError(true)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <Button
        className="self-start"
        onClick={() => {
          setError(false)
          setEditor("create")
        }}
        disabled={pending}
      >
        {t("create")}
      </Button>
      {error && !editor && !rotation && (
        <Alert variant="destructive">
          <AlertDescription>{t("error")}</AlertDescription>
        </Alert>
      )}
      {clients.length === 0 && <p>{t("empty")}</p>}
      {clients.map((client) => (
        <Card key={client.id}>
          <CardHeader>
            <CardTitle>{client.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">{client.disabled ? t("disabled") : t("enabled")}</p>
            <code className="break-all text-sm">{client.id}</code>
            {client.redirectUrls.map((url) => (
              <p key={url} className="break-all text-sm text-muted-foreground">
                {url}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setError(false)
                  setEditor(client)
                }}
              >
                {t("edit")}
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setError(false)
                  setRotation(client)
                }}
              >
                {t("rotate")}
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run({ action: "disable", clientId: client.id, disabled: !client.disabled })}
              >
                {client.disabled ? t("enable") : t("disable")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Dialog
        open={editor !== undefined}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setEditor(undefined)
            setError(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor === "create" ? t("create") : t("edit")}</DialogTitle>
          </DialogHeader>
          <form
            key={typeof editor === "object" ? editor.id : "create"}
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              const details = {
                name: String(data.get("name")),
                redirectUrls: String(data.get("redirectUrls"))
                  .split(/\r?\n/)
                  .map((url) => url.trim())
                  .filter(Boolean)
              }
              run(
                typeof editor === "object"
                  ? { action: "edit", clientId: editor.id, ...details }
                  : { action: "create", ...details }
              )
            }}
          >
            <InputField
              name="name"
              label={t("name")}
              required
              maxLength={200}
              defaultValue={typeof editor === "object" ? editor.name : ""}
            />
            <Field>
              <FieldLabel htmlFor="redirectUrls">{t("redirectUrls")}</FieldLabel>
              <Textarea
                id="redirectUrls"
                name="redirectUrls"
                required
                defaultValue={typeof editor === "object" ? editor.redirectUrls.join("\n") : ""}
              />
            </Field>
            <p className="text-sm text-muted-foreground">{t("redirectHelp")}</p>
            {error && <p role="alert">{t("error")}</p>}
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!rotation}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setRotation(undefined)
            setError(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rotate")}</DialogTitle>
          </DialogHeader>
          <p>{t("rotateWarning")}</p>
          {error && <p role="alert">{t("error")}</p>}
          <Button disabled={pending} onClick={() => rotation && run({ action: "rotate", clientId: rotation.id })}>
            {t("rotate")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!credentials}
        onOpenChange={(open) => {
          if (!open) setCredentials(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("credentials")}</DialogTitle>
          </DialogHeader>
          <p>{t("secretWarning")}</p>
          <InputField label={t("clientId")} value={credentials?.clientId ?? ""} readOnly />
          {credentials?.secret && <ClientSecret secret={credentials.secret} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ClientSecret({ secret }: { secret: string }) {
  const t = useTranslations("OidcClients")
  const [feedback, setFeedback] = useState<"copied" | "copyFailed">()

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret)
      setFeedback("copied")
    } catch {
      setFeedback("copyFailed")
    }
  }

  return (
    <>
      <InputField label={t("secret")} value={secret} readOnly autoComplete="off" />
      <Button onClick={copySecret}>{t("copy")}</Button>
      {feedback && <p role={feedback === "copyFailed" ? "alert" : "status"}>{t(feedback)}</p>}
    </>
  )
}
