"use client"

import { type FormEvent, startTransition, useActionState, useEffect, useId, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { IDLE } from "@/shared/forms/command-state"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/shared/ui/base/field"
import { RadioGroup, RadioGroupItem } from "@/shared/ui/base/radio-group"
import { Textarea } from "@/shared/ui/base/textarea"
import { toast } from "@/shared/ui/base/toast"
import { answersFor, type ParticipationMode, type RsvpAnswer } from "../model"
import { useEventErrorMessage } from "../ui/errors"
import { LONG_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH } from "../ui/limits"
import { respondToEventAction } from "./actions"
import { OTHER_REASON } from "./response-form"

type OwnResponse = {
  answer: RsvpAnswer
  comment: string | null
  absenceReasonId: string | null
  reasonText: string | null
}

/**
 * The signed-in User's answer to an Event. With No, a reason: required in ResponseRequiredStrict,
 * where Maybe is not offered, and optional otherwise. The comment and reason are private to the
 * User and the organisers.
 */
export function ResponseForm({
  eventId,
  mode,
  reasons,
  own
}: {
  eventId: string
  mode: ParticipationMode
  reasons: { id: string; label: string }[]
  own: OwnResponse | null
}) {
  const t = useTranslations("Events.respond")
  const answers = useTranslations("Events.answers")
  const errorMessage = useEventErrorMessage()
  const id = useId()
  const strict = mode === "ResponseRequiredStrict"
  const [answer, setAnswer] = useState<string>(own?.answer ?? "")
  const [reason, setReason] = useState(
    own?.absenceReasonId ?? (own?.reasonText ? OTHER_REASON : strict ? (reasons[0]?.id ?? OTHER_REASON) : "")
  )
  const [state, formAction, pending] = useActionState(respondToEventAction, IDLE)
  const handled = useRef<number | null>(null)

  useEffect(() => {
    if (state.status !== "success" || handled.current === state.completedAt) return
    handled.current = state.completedAt
    toast.add({ type: "success", title: t("saved") })
  }, [state, t])

  // Submitted by hand, as in CommandDialog, so a failed answer is not reset before it is corrected.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  const reasonOptions = [
    ...(strict ? [] : [{ value: "", label: t("noReason") }]),
    ...reasons.map(({ id, label }) => ({ value: id, label })),
    { value: OTHER_REASON, label: t("otherReason") }
  ]

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <FieldSet>
        <FieldLegend variant="label">{t("answer")}</FieldLegend>
        <RadioGroup
          name="answer"
          value={answer}
          onValueChange={(value) => setAnswer(String(value))}
          className="flex flex-wrap gap-6"
        >
          {answersFor(mode).map((option) => (
            <Field key={option} orientation="horizontal" className="w-auto">
              <RadioGroupItem value={option} id={`${id}-${option}`} />
              <FieldLabel htmlFor={`${id}-${option}`}>{answers(option)}</FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
      {answer === "No" ? (
        <>
          <SelectField
            label={strict ? t("reason") : t("reasonOptional")}
            name="reason"
            options={reasonOptions}
            value={reason}
            onValueChange={setReason}
            required={strict}
          />
          {reason === OTHER_REASON ? (
            <InputField
              label={t("reasonText")}
              name="reasonText"
              defaultValue={own?.reasonText ?? ""}
              maxLength={SHORT_TEXT_MAX_LENGTH}
              required={strict}
            />
          ) : null}
        </>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${id}-comment`}>{t("comment")}</FieldLabel>
        <Textarea
          id={`${id}-comment`}
          name="comment"
          defaultValue={own?.comment ?? ""}
          maxLength={LONG_TEXT_MAX_LENGTH}
        />
        <FieldDescription>{t("privacy")}</FieldDescription>
      </Field>
      <FieldError>{state.status === "error" ? errorMessage(state.error) : undefined}</FieldError>
      <Button type="submit" className="w-fit" disabled={pending || !answer}>
        {pending ? t("saving") : own ? t("change") : t("submit")}
      </Button>
    </form>
  )
}
