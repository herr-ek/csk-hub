"use client"

import { MoreHorizontalIcon } from "lucide-react"
import { useCallback, useEffect, useState, useTransition } from "react"
import { app } from "@/core/config/app"
import { useTranslations } from "@/core/i18n/translations"
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

function getMemberActionConfig(t: ReturnType<typeof useTranslations>): Record<MemberAction, MemberActionConfig> {
  return {
    activate: {
      title: t("activate"),
      description: t("activateDescription", { appName: app.name }),
      submitLabel: t("activate"),
      submitVariant: "default",
      requiresConfirmation: false,
      submitClassName: activateButtonClassName,
      command: activateMember,
      success: (memberName) => ({ title: t("memberActivated"), description: t("memberCanSignIn", { memberName }) })
    },
    deactivate: {
      title: t("deactivate"),
      description: t("deactivateDescription"),
      submitLabel: t("deactivate"),
      submitVariant: "destructive",
      requiresConfirmation: false,
      command: deactivateMember,
      success: (memberName) => ({
        title: t("memberDeactivated"),
        description: t("memberNoLongerHasAccess", { memberName })
      })
    },
    delete: {
      title: t("delete"),
      description: t("deleteDescription"),
      submitLabel: t("delete"),
      submitVariant: "destructive",
      requiresConfirmation: true,
      command: eraseMember,
      success: (memberName) => ({
        title: t("memberDeleted"),
        description: t("memberPermanentlyDeleted", { memberName })
      })
    },
    invite: {
      title: t("sendInvitationTo"),
      description: t("sendInvitationDescription"),
      submitLabel: t("sendInvitation"),
      submitVariant: "default",
      requiresConfirmation: false,
      command: resendInvitation,
      success: (memberName) => ({
        title: t("invitationSent"),
        description: t("inviteSentDescription", { email: memberName })
      })
    },
    role: {
      title: t("manageRolesFor"),
      description: t("manageRolesDescription"),
      submitLabel: t("saveRoles"),
      submitVariant: "default",
      requiresConfirmation: false,
      command: changeMemberRole,
      success: (memberName) => ({ title: t("roleUpdated"), description: t("roleUpdatedDescription", { memberName }) })
    }
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
  const t = useTranslations("Members")
  const common = useTranslations("Common")
  const memberActionConfig = getMemberActionConfig(t)
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
      toast.add({ type: "error", title: t("memberActionFailed"), description: state.error })
    }
  }, [closeDialog, memberActionConfig, memberName, state, t])

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
          title: t("impersonationFailed"),
          description: result.error
        })
        return
      }
      window.location.assign(ROUTES.home)
    } catch {
      toast.add({ type: "error", title: t("impersonationFailed"), description: t("impersonationFailedDescription") })
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
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("actionsFor", { memberName })}>
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
            {t("manageRoles")}
          </DropdownMenuItem>
          {!inactive && !hasAdminRole(role) ? (
            <DropdownMenuItem onClick={impersonate}>{t("impersonate")}</DropdownMenuItem>
          ) : null}
          {!hasPassword ? (
            <DropdownMenuItem onClick={() => setDialogAction("invite")}>{t("sendInvitation")}</DropdownMenuItem>
          ) : null}
          {inactive ? (
            <DropdownMenuItem
              className="text-yellow-700 focus:text-yellow-800 dark:text-yellow-400 dark:focus:text-yellow-300"
              onClick={() => setDialogAction("activate")}
            >
              {t("activate")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className={destructiveMenuItemClassName} onClick={() => setDialogAction("deactivate")}>
              {t("deactivate")}
            </DropdownMenuItem>
          )}
          {inactive ? (
            <DropdownMenuItem className={destructiveMenuItemClassName} onClick={() => setDialogAction("delete")}>
              {t("delete")}
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
            <AlertDialogTitle>{t("dialogTitle", { action: dialogCopy.title, memberName })}</AlertDialogTitle>
            <AlertDialogDescription>{dialogCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {dialogCopy.requiresConfirmation ? (
            <div className="space-y-2">
              <label htmlFor={`delete-confirmation-${userId}`} className="text-sm font-medium">
                {t("typeToConfirm", { confirmation: requiredDeleteConfirmation })}
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
                  {t("admin")}
                  <span className="block text-muted-foreground text-xs font-normal">{t("adminDescription")}</span>
                </label>
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{common("cancel")}</AlertDialogCancel>
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
