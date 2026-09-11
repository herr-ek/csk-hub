import { Alert, AlertDescription } from "@/shared/ui/base/alert"

export type NotificationFeedback = { success: boolean; message: string }

export function NotificationFeedbackMessage({ feedback }: { feedback: NotificationFeedback }) {
  return (
    <Alert variant={feedback.success ? "default" : "destructive"}>
      <AlertDescription>{feedback.message}</AlertDescription>
    </Alert>
  )
}
