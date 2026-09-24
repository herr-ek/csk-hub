import type { KeyboardEvent } from "react"

/** Submits a composer on Enter while preserving Shift+Enter for a newline. */
export function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, pending: boolean) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return

  event.preventDefault()

  if (!pending) event.currentTarget.form?.requestSubmit()
}
