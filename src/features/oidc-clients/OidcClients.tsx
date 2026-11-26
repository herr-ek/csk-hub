"use client"

import { useState, useTransition } from "react"
import {
  type ClaimGroupId,
  claimGroups,
  oauthCatalogue,
  signInScope,
  standardLoginScopes
} from "@/core/auth/oauth/catalogue"
import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Checkbox } from "@/shared/ui/base/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/base/dialog"
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/shared/ui/base/field"
import { Textarea } from "@/shared/ui/base/textarea"
import { updateOidcClient } from "./actions"
import type { ClientCommand, OidcClient } from "./clients.server"

type ClientDetails = {
  name: string
  signIn: boolean
  redirectUrls: string[]
  scopes: string[]
  claimGroups: ClaimGroupId[]
  clientCredentialsScopes: string[]
}

export function OidcClients({ clients }: { clients: OidcClient[] }) {
  const t = useTranslations("OidcClients")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<"error" | "accessRequired" | null>(null)
  const [editor, setEditor] = useState<OidcClient | "create">()
  const [rotation, setRotation] = useState<OidcClient>()
  const [credentials, setCredentials] = useState<{ clientId: string; secret?: string }>()

  function run(command: ClientCommand) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await updateOidcClient(command)
        if (!result.success) {
          setError("error")
          return
        }
        setEditor(undefined)
        setRotation(undefined)
        setCredentials(result.credentials)
      } catch {
        setError("error")
      }
    })
  }

  function submit(details: ClientDetails) {
    if (!details.signIn && details.clientCredentialsScopes.length === 0) {
      setError("accessRequired")
      return
    }
    run(
      typeof editor === "object"
        ? { action: "edit", clientId: editor.id, ...details }
        : { action: "create", ...details }
    )
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <Button
        className="self-start"
        onClick={() => {
          setError(null)
          setEditor("create")
        }}
        disabled={pending}
      >
        {t("create")}
      </Button>
      {error && !editor && !rotation && (
        <Alert variant="destructive">
          <AlertDescription>{t(error)}</AlertDescription>
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
                  setError(null)
                  setEditor(client)
                }}
              >
                {t("edit")}
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setError(null)
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
            setError(null)
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor === "create" ? t("create") : t("edit")}</DialogTitle>
          </DialogHeader>
          <ClientForm
            key={typeof editor === "object" ? editor.id : "create"}
            client={typeof editor === "object" ? editor : undefined}
            error={error}
            pending={pending}
            onSubmit={submit}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!rotation}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setRotation(undefined)
            setError(null)
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

function ClientForm({
  client,
  error,
  pending,
  onSubmit
}: {
  client?: OidcClient
  error: "error" | "accessRequired" | null
  pending: boolean
  onSubmit: (details: ClientDetails) => void
}) {
  const t = useTranslations("OidcClients")
  const [signIn, setSignIn] = useState(client ? client.signIn : true)
  const [redirectUrls, setRedirectUrls] = useState(client ? client.redirectUrls.join("\n") : "")
  const [loginScopes, setLoginScopes] = useState<string[]>(client ? client.scopes : [...standardLoginScopes])
  const [enabledClaimGroups, setEnabledClaimGroups] = useState<ClaimGroupId[]>(client ? client.claimGroups : [])
  const [apiScopes, setApiScopes] = useState<string[]>(client ? client.clientCredentialsScopes : [])

  const userScopes = oauthCatalogue.userScopes.map((entry) => entry.scope)
  const machineScopes = oauthCatalogue.apiScopes.map((entry) => entry.scope)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({
          name: String(new FormData(event.currentTarget).get("name")),
          signIn,
          redirectUrls: redirectUrls
            .split(/\r?\n/)
            .map((url) => url.trim())
            .filter(Boolean),
          scopes: loginScopes,
          claimGroups: enabledClaimGroups,
          clientCredentialsScopes: apiScopes
        })
      }}
    >
      <InputField name="name" label={t("name")} required maxLength={200} defaultValue={client ? client.name : ""} />
      <FieldSet className="gap-3">
        <Field orientation="horizontal">
          <Checkbox id="oidc-sign-in" checked={signIn} onCheckedChange={setSignIn} />
          <FieldLabel htmlFor="oidc-sign-in">
            {t("signIn")} <code className="text-xs text-muted-foreground">{signInScope}</code>
          </FieldLabel>
        </Field>
        {signIn && (
          <div className="flex flex-col gap-4 border-l pl-4">
            <Field>
              <FieldLabel htmlFor="redirectUrls">{t("redirectUrls")}</FieldLabel>
              <Textarea
                id="redirectUrls"
                required
                value={redirectUrls}
                onChange={(event) => setRedirectUrls(event.target.value)}
              />
            </Field>
            <p className="text-sm text-muted-foreground">{t("redirectHelp")}</p>
            <FieldSet className="gap-3">
              <FieldLegend variant="label">{t("readAboutUser")}</FieldLegend>
              {standardLoginScopes.map((scope) => (
                <ScopeOption
                  key={scope}
                  id={`oidc-scope-${scope}`}
                  label={t(`scopes.${scope}`)}
                  code={scope}
                  checked={loginScopes.includes(scope)}
                  onChange={(on) => setLoginScopes(toggle(loginScopes, scope, on))}
                />
              ))}
              {claimGroups.map((group) => (
                <ScopeOption
                  key={group.id}
                  id={`oidc-claim-${group.id}`}
                  label={t(`claimGroups.${group.id}.title`)}
                  description={t(`claimGroups.${group.id}.description`)}
                  code={group.id}
                  checked={enabledClaimGroups.includes(group.id)}
                  onChange={(on) => setEnabledClaimGroups(toggle(enabledClaimGroups, group.id, on))}
                />
              ))}
            </FieldSet>
            <FieldSet className="gap-3">
              <FieldLegend variant="label">{t("resourcesOnBehalf")}</FieldLegend>
              {userScopes.length === 0 && <p className="text-sm text-muted-foreground">{t("noResources")}</p>}
              {userScopes.map((scope) => (
                <ScopeOption
                  key={scope}
                  id={`oidc-scope-${scope}`}
                  label={scope}
                  code={scope}
                  checked={loginScopes.includes(scope)}
                  onChange={(on) => setLoginScopes(toggle(loginScopes, scope, on))}
                />
              ))}
            </FieldSet>
          </div>
        )}
      </FieldSet>
      <FieldSet className="gap-3">
        <FieldLegend variant="label">{t("apiResources")}</FieldLegend>
        <p className="text-sm text-muted-foreground">{t("apiWarning")}</p>
        {machineScopes.length === 0 && <p className="text-sm text-muted-foreground">{t("noResources")}</p>}
        {machineScopes.map((scope) => (
          <ScopeOption
            key={scope}
            id={`oidc-api-${scope}`}
            label={scope}
            code={scope}
            checked={apiScopes.includes(scope)}
            onChange={(on) => setApiScopes(toggle(apiScopes, scope, on))}
          />
        ))}
      </FieldSet>
      {error && <p role="alert">{t(error)}</p>}
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </form>
  )
}

function ScopeOption({
  id,
  label,
  description,
  code,
  checked,
  onChange
}: {
  id: string
  label: string
  description?: string
  code: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <FieldLabel htmlFor={id}>
        <span>
          {label} <code className="text-xs text-muted-foreground">{code}</code>
        </span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </FieldLabel>
    </Field>
  )
}

function toggle<T extends string>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...list.filter((item) => item !== value), value] : list.filter((item) => item !== value)
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
