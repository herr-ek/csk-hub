"use client"

import { Check, X } from "lucide-react"
import { type ReactElement, startTransition, useActionState, useEffect, useId, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { IDLE } from "@/shared/forms/command-state"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldError, FieldLabel } from "@/shared/ui/base/field"
import { Textarea } from "@/shared/ui/base/textarea"
import { toast } from "@/shared/ui/base/toast"
import { cn } from "@/shared/utils"
import type { ParticipationMode, RsvpAnswer } from "../model"
import { EventCommandDialog } from "../ui/EventCommandDialog"
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

type Reasons = { id: string; label: string }[]

// Solid until the User has answered; then only their answer stays solid.
const YES = {
  solid: "bg-green-600 text-white hover:bg-green-700",
  outline: "border-green-600/40 bg-transparent text-green-700 hover:bg-green-600/10 dark:text-green-400"
}
const NO = {
  solid: "bg-destructive text-white hover:bg-destructive/90",
  outline: "border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10"
}

/**
 * Answering an Event in one tap: Yes is saved at once, No asks for a reason first. In
 * ResponseRequired, Maybe is offered too. The comment and reason are private to the User and the
 * organisers.
 */
export function ResponseBar({
  eventId,
  mode,
  reasons,
  own
}: {
  eventId: string
  mode: ParticipationMode
  reasons: Reasons
  own: OwnResponse | null
}) {
  const t = useTranslations("Events.respond")
  const answers = useTranslations("Events.answers")
  const errorMessage = useEventErrorMessage()
  const [state, formAction, pending] = useActionState(respondToEventAction, IDLE)
  const handled = useRef<number | null>(null)
  const chosen = own?.answer

  useEffect(() => {
    if (state.status !== "success" || handled.current === state.completedAt) return
    handled.current = state.completedAt
    toast.add({ type: "success", title: t("saved") })
  }, [state, t])

  // Changing the answer keeps the comment; a reason goes only with No, so it is dropped.
  function answer(value: "Yes" | "Maybe") {
    const data = new FormData()
    data.set("eventId", eventId)
    data.set("answer", value)
    if (own?.comment) data.set("comment", own.comment)
    startTransition(() => formAction(data))
  }
  const style = (option: RsvpAnswer, colors: typeof YES) =>
    !chosen || chosen === option ? colors.solid : colors.outline

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          className={cn("h-14 rounded-2xl text-base", style("Yes", YES))}
          aria-pressed={chosen === "Yes"}
          disabled={pending}
          onClick={() => answer("Yes")}
        >
          <Check className="size-5" aria-hidden="true" />
          {answers("Yes")}
        </Button>
        <ResponseDialog
          eventId={eventId}
          mode={mode}
          reasons={reasons}
          own={own}
          answer="No"
          title={t("noTitle")}
          trigger={
            <Button
              type="button"
              className={cn("h-14 rounded-2xl text-base", style("No", NO))}
              aria-pressed={chosen === "No"}
              disabled={pending}
            >
              <X className="size-5" aria-hidden="true" />
              {answers("No")}
            </Button>
          }
        />
      </div>
      {mode !== "ResponseRequiredStrict" || own ? (
        <div className="flex flex-wrap gap-2">
          {mode !== "ResponseRequiredStrict" ? (
            <Button
              type="button"
              variant={chosen === "Maybe" ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={chosen === "Maybe"}
              disabled={pending}
              onClick={() => answer("Maybe")}
            >
              {answers("Maybe")}
            </Button>
          ) : null}
          {own ? (
            <ResponseDialog
              eventId={eventId}
              mode={mode}
              reasons={reasons}
              own={own}
              answer={own.answer}
              title={t("commentTitle")}
              trigger={
                <Button type="button" variant="ghost" size="sm" disabled={pending}>
                  {own.comment ? t("editComment") : t("addComment")}
                </Button>
              }
            />
          ) : null}
        </div>
      ) : null}
      <FieldError>{state.status === "error" ? errorMessage(state.error) : undefined}</FieldError>
    </div>
  )
}

/** The answer with what goes with it: the reason for a No, and the comment. */
function ResponseDialog({
  eventId,
  mode,
  reasons,
  own,
  answer,
  title,
  trigger
}: {
  eventId: string
  mode: ParticipationMode
  reasons: Reasons
  own: OwnResponse | null
  answer: RsvpAnswer
  title: string
  trigger: ReactElement
}) {
  const t = useTranslations("Events.respond")
  return (
    <EventCommandDialog
      trigger={trigger}
      title={title}
      description={t("privacy")}
      action={respondToEventAction}
      submitLabel={t("save")}
      successMessage={t("saved")}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="answer" value={answer} />
      {answer === "No" ? <ReasonFields mode={mode} reasons={reasons} own={own} /> : null}
      <CommentField comment={own?.comment ?? ""} />
    </EventCommandDialog>
  )
}

/** A preset reason or "Other" with the User's own words; required in ResponseRequiredStrict. */
function ReasonFields({ mode, reasons, own }: { mode: ParticipationMode; reasons: Reasons; own: OwnResponse | null }) {
  const t = useTranslations("Events.respond")
  const strict = mode === "ResponseRequiredStrict"
  const kept = own?.answer === "No" ? own : null
  const [reason, setReason] = useState(
    kept?.absenceReasonId ?? (kept?.reasonText ? OTHER_REASON : strict ? (reasons[0]?.id ?? OTHER_REASON) : "")
  )
  return (
    <>
      <SelectField
        label={strict ? t("reason") : t("reasonOptional")}
        name="reason"
        options={[
          ...(strict ? [] : [{ value: "", label: t("noReason") }]),
          ...reasons.map(({ id, label }) => ({ value: id, label })),
          { value: OTHER_REASON, label: t("otherReason") }
        ]}
        value={reason}
        onValueChange={setReason}
        required={strict}
      />
      {reason === OTHER_REASON ? (
        <InputField
          label={t("reasonText")}
          name="reasonText"
          defaultValue={kept?.reasonText ?? ""}
          maxLength={SHORT_TEXT_MAX_LENGTH}
          required={strict}
        />
      ) : null}
    </>
  )
}

function CommentField({ comment }: { comment: string }) {
  const t = useTranslations("Events.respond")
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("comment")}</FieldLabel>
      <Textarea id={id} name="comment" defaultValue={comment} maxLength={LONG_TEXT_MAX_LENGTH} />
    </Field>
  )
}
