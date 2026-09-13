"use client"

import { useActionState, useEffect, useRef } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { DialogClose } from "@/shared/ui/base/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { toast } from "@/shared/ui/base/toast"
import { type AddMemberState, addMember } from "./actions"

export function AddMemberForm() {
  const t = useTranslations("Members")
  const common = useTranslations("Common")
  const [state, action, pending] = useActionState<AddMemberState, FormData>(addMember, { status: "idle" })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.status === "success" || state.status === "email-failed") {
      formRef.current?.reset()
      if (state.status === "success") {
        toast.add({
          type: "success",
          title: t("inviteSent"),
          description: t("inviteSentDescription", { email: state.email })
        })
      } else {
        toast.add({
          type: "warning",
          title: t("inviteNotSent"),
          description: t("inviteNotSentDescription", { email: state.email })
        })
      }
    }
  }, [state, t])

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="member-name">{common("name")}</FieldLabel>
          <Input id="member-name" name="name" type="text" autoComplete="name" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="member-email">{common("email")}</FieldLabel>
          <Input id="member-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <FieldError>{state.status === "error" ? state.error : undefined}</FieldError>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("adding") : t("add")}
        </Button>
        <DialogClose render={<Button type="button" variant="ghost" />}>{common("cancel")}</DialogClose>
      </div>
    </form>
  )
}
