"use client"

import { Check, CircleHelp, X } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { type ReactElement, startTransition, useActionState, useEffect, useId, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { IDLE } from "@/shared/forms/command-state"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Badge } from "@/shared/ui/base/badge"
import { Button, buttonVariants } from "@/shared/ui/base/button"
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
  respondedAt: Date
  late: boolean
}

type Reasons = { id: string; label: string }[]

// Outlined in the answer's colour, so the row stays calm until it is used.
const ANSWER_STYLE: Record<RsvpAnswer, string> = {
  Yes: "border-green-600/40 text-green-700 hover:bg-green-600/10 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400",
  No: "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
  Maybe: ""
}
const ANSWER_ICON: Record<RsvpAnswer, typeof Check> = { Yes: Check, No: X, Maybe: CircleHelp }

const press = { whileHover: { y: -1 }, whileTap: { scale: 0.94 } } as const
const swap = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18 }
} as const

/**
 * Answering an Event on one line: the question with Yes and No (and Maybe in ResponseRequired),
 * or, once answered, the answer with a way to change it. Yes and Maybe are saved at once; No asks
 * for a reason first. The comment and reason are private to the User and the organisers.
 */
export function ResponseBar({
  eventId,
  mode,
  reasons,
  own,
  deadline
}: {
  eventId: string
  mode: ParticipationMode
  reasons: Reasons
  own: OwnResponse | null
  /** The respond-by deadline, already in words. */
  deadline: string | null
}) {
  const t = useTranslations("Events.respond")
  const answers = useTranslations("Events.answers")
  const common = useTranslations("Common")
  const errorMessage = useEventErrorMessage()
  const [state, formAction, pending] = useActionState(respondToEventAction, IDLE)
  const handled = useRef<number | null>(null)
  const [changing, setChanging] = useState(false)

  // A newly saved answer, from a button or the dialog, ends the change.
  const answeredAt = own?.respondedAt.getTime()
  const [seenAnswer, setSeenAnswer] = useState(answeredAt)
  if (seenAnswer !== answeredAt) {
    setSeenAnswer(answeredAt)
    setChanging(false)
  }

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

  const option = (value: RsvpAnswer) => {
    const Icon = ANSWER_ICON[value]
    return {
      type: "button" as const,
      disabled: pending,
      "aria-pressed": own?.answer === value,
      className: cn(buttonVariants({ variant: "outline", size: "sm" }), ANSWER_STYLE[value]),
      ...press,
      children: (
        <>
          <Icon aria-hidden="true" />
          {answers(value)}
        </>
      )
    }
  }

  const AnsweredIcon = own ? ANSWER_ICON[own.answer] : Check

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        {!own || changing ? (
          <motion.div key="ask" {...swap} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-col">
              <span className="font-medium">{t("answer")}</span>
              {deadline ? <span className="text-xs text-muted-foreground">{deadline}</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <motion.button {...option("Yes")} onClick={() => answer("Yes")} />
              <ResponseDialog
                eventId={eventId}
                mode={mode}
                reasons={reasons}
                own={own}
                answer="No"
                title={t("noTitle")}
                trigger={<motion.button {...option("No")} />}
              />
              {mode !== "ResponseRequiredStrict" ? (
                <motion.button {...option("Maybe")} onClick={() => answer("Maybe")} />
              ) : null}
              {own ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)}>
                  {common("cancel")}
                </Button>
              ) : null}
            </div>
          </motion.div>
        ) : (
          <motion.div key="answered" {...swap} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className={cn("flex flex-wrap items-center gap-2 font-medium", ANSWER_STYLE[own.answer])}>
              <motion.span
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
                className="flex"
              >
                <AnsweredIcon className="size-4" aria-hidden="true" />
              </motion.span>
              {t(`answered.${own.answer}`)}
              {own.late ? <Badge variant="destructive">{t("late")}</Badge> : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <ResponseDialog
                eventId={eventId}
                mode={mode}
                reasons={reasons}
                own={own}
                answer={own.answer}
                title={t("commentTitle")}
                trigger={
                  <Button type="button" variant="ghost" size="sm">
                    {own.comment ? t("editComment") : t("addComment")}
                  </Button>
                }
              />
              <motion.button
                type="button"
                className={buttonVariants({ variant: "outline", size: "sm" })}
                onClick={() => setChanging(true)}
                {...press}
              >
                {t("changeAnswer")}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <FieldError>{state.status === "error" ? errorMessage(state.error) : undefined}</FieldError>
    </MotionConfig>
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
