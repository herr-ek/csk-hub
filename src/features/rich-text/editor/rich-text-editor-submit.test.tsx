import { registerDom } from "../../../../test/dom"

// ProseMirror and React both need a DOM, registered before the modules below evaluate.
registerDom()

import { describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"

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

const LABEL = "Body"

const stored = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Bring the folder." }] }]
}

/** The editor inside a form, mounted the way a page mounts it. */
async function mountEditor(): Promise<HTMLFormElement> {
  const container = document.createElement("div")
  document.body.appendChild(container)

  await act(async () =>
    createRoot(container).render(
      <form>
        <span id="body-label">{LABEL}</span>
        <RichTextEditor
          schema={schema}
          name="body"
          defaultValue={stored}
          labelledBy="body-label"
          placeholder="Write."
        />
      </form>
    )
  )

  const form = container.querySelector("form")
  if (!form) throw new Error("The form did not mount.")
  return form
}

describe("the field the form submits", () => {
  test("carries the document from the first paint, before anyone types", async () => {
    const form = await mountEditor()

    // The editor writes into this field as the writer types. Until it does — a
    // submission that beats its mount, or an untouched draft — the field still carries
    // the document the form opened with, rather than the empty body the action rejects.
    expect(new FormData(form).get("body")).toBe(JSON.stringify(stored))
  })
})
