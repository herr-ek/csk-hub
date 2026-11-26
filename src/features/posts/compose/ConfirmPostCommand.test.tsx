import { afterEach, expect, mock, test } from "bun:test"
import { registerDom } from "@test/dom"
import type { ComponentProps } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { NextIntlClientProvider } from "@/core/i18n/client"
import { getMessages } from "@/core/i18n/messages"
import type { PostCommandState } from "./actions"

const dialog = await import("@/shared/ui/base/alert-dialog")
const RootDialog = dialog.AlertDialog
let openDialog: (() => void) | undefined
let dialogOpen: boolean | undefined
mock.module("@/shared/ui/base/alert-dialog", () => ({
  ...dialog,
  AlertDialog: (props: ComponentProps<typeof dialog.AlertDialog>) => {
    dialogOpen = props.open
    openDialog = () => props.onOpenChange?.(true, {} as Parameters<NonNullable<typeof props.onOpenChange>>[1])
    return <RootDialog {...props} />
  }
}))
const { ConfirmPostCommand } = await import("./ConfirmPostCommand")

registerDom()
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
})

test.each(["unpublish", "discard"] as const)(
  "%s keeps the confirmed revision through a live refresh",
  async (command) => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const action = async (): Promise<PostCommandState> => ({ status: "error", error: "commandConflict" })
    const render = async (revision: number) =>
      act(async () =>
        root?.render(
          <NextIntlClientProvider locale="en" messages={getMessages("en")} timeZone="Europe/Stockholm">
            <ConfirmPostCommand command={command} revision={revision} action={action} />
          </NextIntlClientProvider>
        )
      )

    await render(5)
    await act(async () => openDialog?.())
    expect(dialogOpen).toBe(true)

    await render(6)
    const form = container.querySelector("form")
    if (!form) throw new Error("Missing confirmation form")
    expect(new FormData(form).get("revision")).toBe("5")
  }
)
