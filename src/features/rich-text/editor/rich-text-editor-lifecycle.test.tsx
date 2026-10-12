import { describe, expect, mock, test } from "bun:test"
import { registerDom } from "@test/dom"
import type { Editor } from "@tiptap/core"
import { act } from "react"
import { createRoot } from "react-dom/client"

registerDom()

// The toolbar reads its labels from next-intl, which wants a provider this test has no
// use for; the labels are not what is under test.
mock.module("@/core/i18n/translations", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({})
}))

// React only runs effects under `act` when it is told it is in a test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { createDocumentSchema, richText } = await import("../document")
const { RichTextEditor } = await import("./rich-text-editor")

const schema = createDocumentSchema([richText.headings([2, 3]), richText.emphasis])

function editorOf(container: HTMLElement): Editor {
  const dom = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null
  if (!dom?.editor) throw new Error("The editor did not mount.")
  return dom.editor
}

describe("the editor's lifecycle", () => {
  test("survives a render that is handed an editor Tiptap has already destroyed", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = () =>
      root.render(
        <RichTextEditor
          schema={schema}
          name="body"
          labelledBy="label"
          placeholder="Write."
          // A new callback on every render, as a consumer's form hands down.
          onChange={() => undefined}
        />
      )

    await act(async () => render())
    const first = editorOf(container)

    // Tiptap destroys an editor on a timer once its effects are cleaned up; a render can
    // still be handed that instance before the swap to a fresh one reaches it.
    first.destroy()
    await act(async () => render())

    const next = editorOf(container)
    expect(next).not.toBe(first)
    expect(next.isDestroyed).toBe(false)
    expect(container.querySelector('[role="toolbar"], [aria-label="heading"]')).not.toBeNull()

    await act(async () => root.unmount())
  })
})
