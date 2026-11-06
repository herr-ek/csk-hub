"use client"

import { type FormEvent, useId, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Checkbox } from "@/shared/ui/base/checkbox"
import { Input } from "@/shared/ui/base/input"
import { Label } from "@/shared/ui/base/label"
import { Textarea } from "@/shared/ui/base/textarea"

type Credentials = { client_id: string; client_secret: string }

export function HubClientRegistrationForm() {
  const t = useTranslations("HubClients")
  const id = useId()
  const [profile, setProfile] = useState(true)
  const [skipConsent, setSkipConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<"invalid" | "denied" | "unavailable">()
  const [credentials, setCredentials] = useState<Credentials>()

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError(undefined)
    try {
      const response = await fetch("/api/oidc/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: data.get("name"),
          redirect_uris: String(data.get("callbacks") ?? "")
            .split(/\r?\n/)
            .map((url) => url.trim())
            .filter(Boolean),
          scope: profile ? "openid profile" : "openid",
          skip_consent: skipConsent
        })
      })
      if (!response.ok) {
        setError(
          response.status === 400
            ? "invalid"
            : response.status === 401 || response.status === 403
              ? "denied"
              : "unavailable"
        )
        return
      }
      const result = await response.json()
      if (typeof result.client_id !== "string" || typeof result.client_secret !== "string") {
        setError("unavailable")
        return
      }
      setCredentials({ client_id: result.client_id, client_secret: result.client_secret })
    } catch {
      setError("unavailable")
    } finally {
      setPending(false)
    }
  }

  if (credentials) {
    return (
      <div className="space-y-4" aria-live="polite">
        <p className="font-medium">{t("registered")}</p>
        <p className="text-sm text-muted-foreground">{t("saveSecret")}</p>
        <div className="space-y-2">
          <Label htmlFor={`${id}-client-id`}>{t("clientId")}</Label>
          <Input id={`${id}-client-id`} value={credentials.client_id} readOnly className="font-mono" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-secret`}>{t("clientSecret")}</Label>
          <Input
            id={`${id}-secret`}
            value={credentials.client_secret}
            readOnly
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCredentials(undefined)
            setProfile(true)
            setSkipConsent(false)
          }}
        >
          {t("done")}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={register} className="space-y-5" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5">
        <InputField label={t("name")} name="name" required maxLength={100} />
        <div className="space-y-2">
          <Label htmlFor={`${id}-callbacks`}>{t("callbacks")}</Label>
          <Textarea
            id={`${id}-callbacks`}
            name="callbacks"
            required
            rows={3}
            aria-describedby={`${id}-callback-help`}
          />
          <p id={`${id}-callback-help`} className="text-sm text-muted-foreground">
            {t("callbacksHelp")}
          </p>
        </div>
        <Label className="leading-normal">
          <Checkbox checked={profile} onCheckedChange={setProfile} />
          {t("profile")}
        </Label>
        <div className="space-y-2">
          <Label className="leading-normal">
            <Checkbox checked={skipConsent} onCheckedChange={setSkipConsent} />
            {t("skipConsent")}
          </Label>
          <p className="text-sm text-muted-foreground">{t("skipConsentHelp")}</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${error}`)}
          </p>
        )}
        <Button type="submit">{pending ? t("registering") : t("register")}</Button>
      </fieldset>
    </form>
  )
}
