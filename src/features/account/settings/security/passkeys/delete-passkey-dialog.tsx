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
  return (
    <AlertDialog open={Boolean(passkeyId)} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete passkey?</AlertDialogTitle>
          <AlertDialogDescription>This passkey will no longer be available for signing in.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => passkeyId && onDelete(passkeyId)}>
            {pending ? "Deleting passkey..." : "Delete passkey"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
