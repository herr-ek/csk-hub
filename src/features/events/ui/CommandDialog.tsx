"use client"

import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState
} from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/shared/ui/base/dialog"
import { FieldError, FieldGroup } from "@/shared/ui/base/field"
import { toast } from "@/shared/ui/base/toast"
import { type EventCommandState, IDLE } from "./command-state"
import { useEventErrorMessage } from "./errors"

type EventAction = (state: EventCommandState, formData: FormData) => Promise<EventCommandState>

type CommandDialogProps = {
  /** The button that opens the dialog. */
  trigger: ReactElement
  title: string
  description?: ReactNode
  action: EventAction
  submitLabel: string
  /** The toast shown when the command succeeds. */
  successMessage: string
  destructive?: boolean
  /** Hidden identifiers and the form's fields. */
  children: ReactNode
}

/** A dialog holding one admin Events command: it shows the command's violation, or closes on success. */
export function CommandDialog({ trigger, title, description, ...form }: CommandDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from a clean command state. */}
        <CommandForm {...form} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CommandForm({
  action,
  submitLabel,
  successMessage,
  destructive,
  children,
  onSuccess
}: Omit<CommandDialogProps, "trigger" | "title" | "description"> & { onSuccess: () => void }) {
  const t = useTranslations("Events")
  const common = useTranslations("Common")
  const errorMessage = useEventErrorMessage()
  const [state, formAction, pending] = useActionState(action, IDLE)
  const handled = useRef<number | null>(null)

  useEffect(() => {
    // The dialog stays mounted while it animates closed, so each success is handled once.
    if (state.status !== "success" || handled.current === state.completedAt) return
    handled.current = state.completedAt
    toast.add({ type: "success", title: successMessage })
    onSuccess()
  }, [state, onSuccess, successMessage])

  // Submitted by hand rather than through `action`, so a field the Admin is correcting after an
  // error keeps what they typed.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <FieldGroup>
        {children}
        <FieldError>{state.status === "error" ? errorMessage(state.error) : undefined}</FieldError>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {pending ? t("working") : submitLabel}
        </Button>
        <DialogClose render={<Button type="button" variant="ghost" />}>{common("cancel")}</DialogClose>
      </div>
    </form>
  )
}
