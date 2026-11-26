import { afterEach, expect, mock, test } from "bun:test"
import { registerDom } from "@test/dom"
import { MotionGlobalConfig } from "motion/react"
import { act, cloneElement, createContext, type ReactElement, type ReactNode, useContext } from "react"
import { createPortal } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import type { PostAddress } from "@/core/authz/model"
import { NextIntlClientProvider } from "@/core/i18n/client"
import { getMessages } from "@/core/i18n/messages"
import type { PostComposeOptions } from "../service"

// Happy DOM cannot drive Base UI's dialog. The stand-in keeps what matters here: the content
// renders in a portal outside the form, and only while open.
type DialogState = { open: boolean; onOpenChange: (open: boolean) => void }
const DialogContext = createContext<DialogState>({ open: false, onOpenChange: () => {} })
const dialog = await import("@/shared/ui/base/dialog")
mock.module("@/shared/ui/base/dialog", () => ({
  ...dialog,
  Dialog: ({ children, ...state }: DialogState & { children: ReactNode }) => (
    <DialogContext value={state}>{children}</DialogContext>
  ),
  DialogTrigger: (props: object) => {
    const { onOpenChange } = useContext(DialogContext)
    return <button {...props} onClick={() => onOpenChange(true)} />
  },
  DialogContent: ({ children }: { children: ReactNode }) =>
    useContext(DialogContext).open ? createPortal(<div role="dialog">{children}</div>, document.body) : null,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
  DialogClose: ({ render, children }: { render: ReactElement<object>; children: ReactNode }) => {
    const { onOpenChange } = useContext(DialogContext)
    return cloneElement(render, { onClick: () => onOpenChange(false) } as object, children)
  }
}))
const { PostAddressFields } = await import("./PostAddressFields")

registerDom()
// Happy DOM rejects the Web Animations Motion cancels on unmount.
MotionGlobalConfig.skipAnimations = true
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const choir = { id: "choir", name: "Kammarkören", active: true }
const options = {
  groups: [choir],
  publishers: [choir],
  audiencesByPublisher: { "": [choir.id], [choir.id]: [choir.id] }
} as PostComposeOptions

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
})

const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(name))
  if (!found) throw new Error(`Missing button ${name}`)
  return found
}
const click = (element: Element) => act(async () => (element as HTMLElement).click())
const label = (name: string) => {
  const found = [...document.querySelectorAll("label")].find((l) => l.textContent === name)
  if (!found) throw new Error(`Missing label ${name}`)
  return found
}

test("the form submits the address only once the dialog applies it", async () => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  const changes: PostAddress[] = []
  await act(async () =>
    root?.render(
      <NextIntlClientProvider locale="en" messages={getMessages("en")} timeZone="Europe/Stockholm">
        <form>
          <PostAddressFields
            initial={{ publisherGroupId: choir.id, audienceAll: false, targets: [] }}
            options={options}
            identityFixed={false}
            onChange={(address) => changes.push(address)}
          />
        </form>
      </NextIntlClientProvider>
    )
  )
  const form = container.querySelector("form")
  if (!form) throw new Error("Missing form")
  const submitted = () => Object.fromEntries(new FormData(form))
  expect(submitted()).toEqual({ publisherGroupId: choir.id, audience: "", targets: "[]" })
  expect(button("Edit").textContent).toContain("Choose an audience")

  await click(button("Edit"))
  await click(label("All CSK"))
  await click(button("Cancel"))
  expect(submitted()).toEqual({ publisherGroupId: choir.id, audience: "", targets: "[]" })
  expect(changes).toEqual([])

  await click(button("Edit"))
  await click(label("All CSK"))
  await click(button("Done"))
  expect(submitted()).toEqual({ publisherGroupId: choir.id, audience: "all", targets: "[]" })
  expect(changes).toEqual([{ publisherGroupId: choir.id, audienceAll: true, targets: [] }])
})
