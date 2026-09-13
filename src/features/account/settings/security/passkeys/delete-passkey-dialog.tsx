import { useTranslations } from "@/core/i18n/translations"
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

export function DeletePasskeyDialog({
  passkeyId,
  onClose,
  onDelete,
  pending = false
}: {
  passkeyId?: string
  onClose: () => void
  onDelete: (id: string) => void
  pending?: boolean
}) {
  const t = useTranslations("AccountSettings")
  const common = useTranslations("Common")
  return (
    <AlertDialog open={Boolean(passkeyId)} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deletePasskeyTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deletePasskeyDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{common("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => passkeyId && onDelete(passkeyId)}>
            {pending ? t("deletingPasskey") : t("deletePasskey")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
