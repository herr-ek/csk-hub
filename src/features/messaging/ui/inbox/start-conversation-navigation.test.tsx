import { beforeEach, expect, mock, test } from "bun:test"
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
  async (_state: MessageCommandState, _formData: FormData): Promise<MessageCommandState> => ({
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
mock.module("../member-selection", () => ({
  MemberSelection: ({ value }: { value: { id: string; name: string }[] }) => (
    <>
      {value.map((member) => (
        <input key={member.id} type="hidden" name="memberIds" value={member.id} />
      ))}
    </>
  )
}))
const { StartConversationDialog } = await import("./start-conversation-dialog")

beforeEach(() => {
  push.mockClear()
  startConversation.mockClear()
})

test("starting from a profile preselects that member in the shared first-message composer", async () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(<StartConversationDialog initialMember={{ id: "member-1", name: "Ada" }} />)
    })
    const form = container.querySelector("form")
    const textarea = container.querySelector("textarea")
    if (!form || !textarea) throw new Error("The direct composer did not mount")
    expect(container.querySelector('input[name="name"]')).toBeNull()
    await act(async () => {
      textarea.value = "Hello Ada"
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    const submitted = startConversation.mock.calls[0][1]
    expect(submitted.getAll("memberIds")).toEqual(["member-1"])
    expect(submitted.get("text")).toBe("Hello Ada")
    expect(push).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

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
