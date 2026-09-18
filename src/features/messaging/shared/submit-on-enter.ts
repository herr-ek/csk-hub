import type { KeyboardEvent } from "react"

export function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, pending: boolean) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return

  event.preventDefault()

  if (!pending) event.currentTarget.form?.requestSubmit()
}
