"use client"

import { useActionState, useEffect, useRef } from "react"
import { Button } from "@/shared/ui/base/button"
import { DialogClose } from "@/shared/ui/base/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { toast } from "@/shared/ui/base/toast"
import { type AddMemberState, addMember } from "./actions"

export function AddMemberForm() {
  const [state, action, pending] = useActionState<AddMemberState, FormData>(addMember, { status: "idle" })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.status === "success" || state.status === "email-failed") {
      formRef.current?.reset()
      if (state.status === "success") {
        toast.add({
          type: "success",
          title: "Invite sent",
          description: `An activation link was sent to ${state.email}.`
        })
      } else {
        toast.add({
          type: "warning",
          title: "Member created, but invite was not sent",
          description: `Use “Send invitation” for ${state.email} from the member list.`
        })
      }
    }
  }, [state])

  return (
    <form ref={formRef} action={action} className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="member-name">Name</FieldLabel>
          <Input id="member-name" name="name" type="text" autoComplete="name" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="member-email">Email</FieldLabel>
          <Input id="member-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <FieldError>{state.status === "error" ? state.error : undefined}</FieldError>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding member" : "Add member"}
        </Button>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
      </div>
    </form>
  )
}
