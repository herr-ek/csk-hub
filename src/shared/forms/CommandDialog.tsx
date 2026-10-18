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
import { type CommandState, IDLE } from "./command-state"

export type CommandDialogProps<Error extends string> = {
  /** The button that opens the dialog. */
  trigger: ReactElement
  title: string
  description?: ReactNode
  action: (state: CommandState<Error>, formData: FormData) => Promise<CommandState<Error>>
  submitLabel: string
  /** Shown on the submit button while the command runs. */
  pendingLabel: string
  cancelLabel: string
  /** The toast shown when the command succeeds. */
  successMessage: string
  /** The message shown for each way the command can fail. */
  errorMessage: (error: Error) => string
  destructive?: boolean
  /** Hidden identifiers and the form's fields. */
  children: ReactNode
}

/**
 * A dialog holding one command: it shows the command's failure, or closes on success. Features
 * wrap it to fill in their own copy.
 */
export function CommandDialog<Error extends string>({
  trigger,
  title,
  description,
  ...form
}: CommandDialogProps<Error>) {
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

function CommandForm<Error extends string>({
  action,
  submitLabel,
  pendingLabel,
  cancelLabel,
  successMessage,
  errorMessage,
  destructive,
  children,
  onSuccess
}: Omit<CommandDialogProps<Error>, "trigger" | "title" | "description"> & { onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(action, IDLE)
  const handled = useRef<number | null>(null)

  useEffect(() => {
    // The dialog stays mounted while it animates closed, so each success is handled once.
    if (state.status !== "success" || handled.current === state.completedAt) return
    handled.current = state.completedAt
    toast.add({ type: "success", title: successMessage })
    onSuccess()
  }, [state, onSuccess, successMessage])

  // Submitted by hand rather than through `action`: React resets an action form's fields when the
  // action settles, which would silently revert a choice the user is about to correct after an error.
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
          {pending ? pendingLabel : submitLabel}
        </Button>
        <DialogClose render={<Button type="button" variant="ghost" />}>{cancelLabel}</DialogClose>
      </div>
    </form>
  )
}
