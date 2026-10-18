import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { registerDom } from "@test/dom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { RichTextDocument } from "@/features/rich-text"
import { useUnsavedPost } from "./use-unsaved-post"

registerDom()
// React only runs effects under `act` when it is told it is in a test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Unsaved = ReturnType<typeof useUnsavedPost>

const SAVED = { title: "Höstkonsert", body: paragraph("Vi sjunger lördag.") }

function paragraph(text: string): RichTextDocument {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }
}

let root: Root | undefined
let unsaved: Unsaved

function Form({ version }: { version: string }) {
  unsaved = useUnsavedPost({ slot: "post-1", version, initial: SAVED })
  return null
}

/** Opens the form the way a page load does; opening it again is a reload. */
async function open(version = "v1") {
  await leave()
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root?.render(<Form version={version} />))
}

async function leave() {
  await act(async () => root?.unmount())
  root = undefined
}

function leavingIsWarned() {
  const event = new window.Event("beforeunload", { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

beforeEach(() => window.sessionStorage.clear())
afterEach(() => leave())

describe("keeping unsaved changes to a Post", () => {
  test("a reload restores what was typed, both fields", async () => {
    await open()
    expect(unsaved.restored).toBeNull()

    unsaved.changeBody(paragraph("Vi sjunger söndag."))
    await open()

    expect(unsaved.restored).toEqual({ title: "Höstkonsert", body: paragraph("Vi sjunger söndag.") })
  })

  test("warns before leaving only while there are unsaved changes", async () => {
    await open()
    expect(leavingIsWarned()).toBe(false)

    unsaved.changeTitle("Höstkonsert, nytt datum")
    expect(leavingIsWarned()).toBe(true)

    unsaved.saving()
    expect(leavingIsWarned()).toBe(false)
  })

  test("a successful save drops the copy", async () => {
    await open()
    unsaved.changeTitle("Sparad")
    unsaved.saving()
    await open()

    expect(unsaved.restored).toBeNull()
  })

  test("a failed save keeps the copy for the next attempt", async () => {
    await open()
    unsaved.changeTitle("Inte sparad")
    unsaved.saving()
    unsaved.saveFailed()
    await open()

    expect(unsaved.restored?.title).toBe("Inte sparad")
  })

  test("a copy of an older version of the Post is thrown away, not laid over the new one", async () => {
    await open("v1")
    unsaved.changeTitle("Gammal ändring")
    await open("v2")

    expect(unsaved.restored).toBeNull()
    await open("v1")
    expect(unsaved.restored).toBeNull()
  })

  test("discarding the restored changes goes back to the saved Post for good", async () => {
    await open()
    unsaved.changeTitle("Ångrad")
    await open()

    await act(async () => unsaved.discard())

    expect(unsaved.restored).toBeNull()
    expect(leavingIsWarned()).toBe(false)
    await open()
    expect(unsaved.restored).toBeNull()
  })
})
