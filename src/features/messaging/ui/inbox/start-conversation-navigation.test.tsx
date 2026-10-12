import { expect, mock, test } from "bun:test"
import { registerDom } from "@test/dom"
import { Activity, act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import type { MessageCommandState } from "../composer/message-command-state"

registerDom()
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const push = mock((_path: string) => {})
const router = { push }
mock.module("next/navigation", () => ({ useRouter: () => router }))
mock.module("@/core/i18n/translations", () => ({ useTranslations: () => (key: string) => key }))
const startConversation = mock(
  async (): Promise<MessageCommandState> => ({
    status: "success",
    conversationId: "group-1"
  })
)
mock.module("./actions", () => ({ startConversationAction: startConversation }))

// Keep the real form and action state; replace only dialog presentation and member search.
function Container({ children }: { children?: ReactNode }) {
  return <div>{children}</div>
}
mock.module("@/shared/ui/base/dialog", () => ({
  Dialog: Container,
  DialogContent: Container,
  DialogHeader: Container,
  DialogTitle: Container,
  DialogDescription: Container,
  DialogTrigger: () => null,
  DialogClose: () => null
}))
mock.module("../member-selection", () => ({ MemberSelection: () => null }))
const { StartConversationDialog } = await import("./start-conversation-dialog")

test("returning to the inbox after creation does not reopen the conversation", async () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const renderInbox = async (mode: "visible" | "hidden") => {
    await act(async () => {
      root.render(
        <Activity mode={mode}>
          <StartConversationDialog />
        </Activity>
      )
    })
  }
  try {
    await renderInbox("visible")
    const form = container.querySelector("form")
    if (!form) throw new Error("The creation form did not mount")
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(startConversation).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenLastCalledWith("/messages/group-1")

    // Next.js hides the inbox on navigation and restores it on browser Back.
    await renderInbox("hidden")
    await renderInbox("visible")
    expect(push).toHaveBeenCalledTimes(1)
    expect(startConversation).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
