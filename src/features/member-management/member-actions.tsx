"use client"

import { MoreHorizontalIcon } from "lucide-react"
import { useCallback, useEffect, useState, useTransition } from "react"
import { ROUTES } from "@/core/navigation/site"
import { ADMIN_ROLE, hasAdminRole, MEMBER_ROLE } from "@/shared/roles"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/shared/ui/base/alert-dialog"
import { Button } from "@/shared/ui/base/button"
import { Checkbox } from "@/shared/ui/base/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/shared/ui/base/dropdown-menu"
import { Input } from "@/shared/ui/base/input"
import { toast } from "@/shared/ui/base/toast"
import {
  activateMember,
  changeMemberRole,
  deactivateMember,
  eraseMember,
  impersonateMember,
  type MemberCommandState,
  resendInvitation
} from "./actions"

type MemberAction = "activate" | "deactivate" | "delete" | "invite" | "role"
const destructiveMenuItemClassName =
  "!text-destructive hover:!bg-destructive/20 focus:!bg-destructive/20 data-highlighted:!bg-destructive/20 focus:!text-destructive"
const activateButtonClassName =
  "bg-yellow-400 text-yellow-950 hover:bg-yellow-300 dark:bg-yellow-500 dark:hover:bg-yellow-400"

type DialogCopy = {
  title: string
  description: string
  submitLabel: string
  submitVariant: "default" | "destructive"
  requiresConfirmation: boolean
  submitClassName?: string
}

type MemberCommand = (state: MemberCommandState, formData: FormData) => Promise<MemberCommandState>
type MemberActionConfig = DialogCopy & {
  command: MemberCommand
  success: (memberName: string) => { title: string; description: string }
}

const memberActionConfig: Record<MemberAction, MemberActionConfig> = {
  activate: {
    title: "Activate",
    description: "This restores the member's access so they can sign in to CSK Hub again.",
    submitLabel: "Activate",
    submitVariant: "default",
    requiresConfirmation: false,
    submitClassName: activateButtonClassName,
    command: activateMember,
    success: (memberName) => ({ title: "Member activated", description: `${memberName} can sign in again.` })
  },
  deactivate: {
    title: "Deactivate",
    description:
      "This prevents the member from signing in. Their account and history will be kept, and an admin can restore access later.",
    submitLabel: "Deactivate",
    submitVariant: "destructive",
    requiresConfirmation: false,
    command: deactivateMember,
    success: (memberName) => ({ title: "Member deactivated", description: `${memberName} no longer has access.` })
  },
  delete: {
    title: "Delete",
    description: "This permanently deletes the member and all of their account data. This cannot be undone.",
    submitLabel: "Delete",
    submitVariant: "destructive",
    requiresConfirmation: true,
    command: eraseMember,
    success: (memberName) => ({ title: "Member deleted", description: `${memberName} has been permanently deleted.` })
  },
  invite: {
    title: "Send invitation to",
    description: "This sends the member a link to activate their account and set their password.",
    submitLabel: "Send invitation",
    submitVariant: "default",
    requiresConfirmation: false,
    command: resendInvitation,
    success: (memberName) => ({
      title: "Invitation sent",
      description: `An activation link was sent to ${memberName}.`
    })
  },
  role: {
    title: "Manage roles for",
    description: "Choose any additional roles this member should have.",
    submitLabel: "Save roles",
    submitVariant: "default",
    requiresConfirmation: false,
    command: changeMemberRole,
    success: (memberName) => ({ title: "Role updated", description: `${memberName}'s role has been updated.` })
  }
}

export function MemberActions({
  userId,
  memberName,
  inactive,
  hasPassword,
  role
}: {
  userId: string
  memberName: string
  inactive: boolean
  hasPassword: boolean
  role: string
}) {
  const [state, setState] = useState<MemberCommandState>({ status: "idle" })
  const [pending, startTransition] = useTransition()
  const [dialogAction, setDialogAction] = useState<MemberAction | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [isAdmin, setIsAdmin] = useState(() => hasAdminRole(role))
  const requiredDeleteConfirmation = `delete ${memberName}`
  const formId = `member-action-${userId}`

  const closeDialog = useCallback(() => {
    setDialogAction(null)
    setDeleteConfirmation("")
  }, [])

  useEffect(() => {
    if (state.status === "success") {
      closeDialog()
      const { title, description } = memberActionConfig[state.action].success(memberName)

      toast.add({
        type: "success",
        title,
        description
      })
    }
    if (state.status === "error") {
      toast.add({ type: "error", title: "Member action failed", description: state.error })
    }
  }, [closeDialog, memberName, state])

  const dialogCopy = memberActionConfig[dialogAction ?? "activate"]

  function submit(formData: FormData) {
    if (!dialogAction) return
    const { command } = memberActionConfig[dialogAction]
    startTransition(() => void command({ status: "idle" }, formData).then(setState))
  }

  async function impersonate() {
    try {
      const result = await impersonateMember(userId)
      if (result.status === "error") {
        toast.add({
          type: "error",
          title: "Impersonation failed",
          description: result.error
        })
        return
      }
      window.location.assign(ROUTES.home)
    } catch {
      toast.add({ type: "error", title: "Impersonation failed", description: "Unable to switch to this member." })
    }
  }

  return (
    <>
      <form id={formId} action={submit}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="action" value={dialogAction ?? "deactivate"} />
        <input type="hidden" name="roles" value={MEMBER_ROLE} />
        {isAdmin ? <input type="hidden" name="roles" value={ADMIN_ROLE} /> : null}
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${memberName}`}>
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setIsAdmin(hasAdminRole(role))
              setDialogAction("role")
            }}
          >
            Manage roles
          </DropdownMenuItem>
          {!inactive && !hasAdminRole(role) ? (
            <DropdownMenuItem onClick={impersonate}>Impersonate</DropdownMenuItem>
          ) : null}
          {!hasPassword ? (
            <DropdownMenuItem onClick={() => setDialogAction("invite")}>Send invitation</DropdownMenuItem>
          ) : null}
          {inactive ? (
            <DropdownMenuItem
              className="text-yellow-700 focus:text-yellow-800 dark:text-yellow-400 dark:focus:text-yellow-300"
              onClick={() => setDialogAction("activate")}
            >
              Activate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className={destructiveMenuItemClassName} onClick={() => setDialogAction("deactivate")}>
              Deactivate
            </DropdownMenuItem>
          )}
          {inactive ? (
            <DropdownMenuItem className={destructiveMenuItemClassName} onClick={() => setDialogAction("delete")}>
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={dialogAction !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogCopy.title} {memberName}?
            </AlertDialogTitle>
            <AlertDialogDescription>{dialogCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {dialogCopy.requiresConfirmation ? (
            <div className="space-y-2">
              <label htmlFor={`delete-confirmation-${userId}`} className="text-sm font-medium">
                Type <span className="font-mono">{requiredDeleteConfirmation}</span> to confirm
              </label>
              <Input
                id={`delete-confirmation-${userId}`}
                name="confirmation"
                form={formId}
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder={requiredDeleteConfirmation}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ) : null}
          {dialogAction === "role" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox id={`admin-role-${userId}`} checked={isAdmin} onCheckedChange={setIsAdmin} />
                <label htmlFor={`admin-role-${userId}`} className="text-sm font-medium">
                  Admin
                  <span className="block text-muted-foreground text-xs font-normal">
                    Can invite, manage, and impersonate Members.
                  </span>
                </label>
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              form={formId}
              variant={dialogCopy.submitVariant}
              disabled={
                pending || (dialogCopy.requiresConfirmation && deleteConfirmation !== requiredDeleteConfirmation)
              }
              className={dialogCopy.submitClassName}
            >
              {dialogCopy.submitLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
