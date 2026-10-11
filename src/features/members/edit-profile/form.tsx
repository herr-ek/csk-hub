"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { VOICE_DIVISIONS, type VoiceDivision } from "@/features/voice/model"
import { Button, buttonVariants } from "@/shared/ui/base/button"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Checkbox } from "@/shared/ui/base/checkbox"
import { saveProfileAction } from "./actions"
import type { EditProfileState } from "./state"

const initialState: EditProfileState = { status: "idle" }

export function EditProfileForm({ initialVoices }: { initialVoices: VoiceDivision[] }) {
  const t = useTranslations("MemberProfiles")
  const [voices, setVoices] = useState(initialVoices)
  const [state, action, pending] = useActionState(saveProfileAction, initialState)
  const savedVoices = state.status === "success" ? state.voices : initialVoices
  const changed = voices.length !== savedVoices.length || voices.some((voice) => !savedVoices.includes(voice))
  return (
    <form action={action} className="flex flex-col gap-5">
      <Card>
        <CardContent>
          <fieldset disabled={pending} aria-describedby="voice-capabilities-description">
            <legend className="mb-2 font-heading text-lg font-semibold">{t("canSing")}</legend>
            <p id="voice-capabilities-description" className="mb-5 text-sm text-muted-foreground">
              {t("capabilitiesDescription")}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {VOICE_DIVISIONS.map((voice) => (
                <label
                  key={voice}
                  htmlFor={`voice-${voice}`}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 has-data-checked:border-primary has-data-checked:bg-primary/5"
                >
                  <Checkbox
                    id={`voice-${voice}`}
                    name="voices"
                    value={voice}
                    checked={voices.includes(voice)}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      setVoices((current) =>
                        checked ? [...current, voice] : current.filter((value) => value !== voice)
                      )
                    }
                  />
                  <span className="font-medium">{voice}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`editErrors.${state.error}`)}
        </p>
      ) : null}
      {state.status === "success" && !changed ? (
        <p className="text-sm" role="status">
          {t("profileSaved")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || !changed}>
          {t(pending ? "savingProfile" : "saveProfile")}
        </Button>
        <Link href={ROUTES.account} className={buttonVariants({ variant: "outline" })}>
          {t("backToProfile")}
        </Link>
      </div>
    </form>
  )
}
