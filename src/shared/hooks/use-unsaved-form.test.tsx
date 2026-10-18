import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { registerDom } from "@test/dom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useUnsavedForm } from "./use-unsaved-form"

registerDom()
// React only runs effects under `act` when it is told it is in a test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The Post form's tests cover restoring, versions, failed saves and discarding through
// `useUnsavedPost`; these cover what only a form that stays open after saving needs.

type Unsaved = ReturnType<typeof useUnsavedForm<string>>

let root: Root | undefined
let unsaved: Unsaved

const parse = (value: unknown) => (typeof value === "string" ? value : null)

function Form() {
  unsaved = useUnsavedForm({ storageKey: "test", version: "v1", parse })
  return null
}

async function open() {
  await act(async () => root?.unmount())
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root?.render(<Form />))
}

function leavingIsWarned() {
  const event = new window.Event("beforeunload", { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

beforeEach(() => window.sessionStorage.clear())
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
})

describe("keeping an unsaved form", () => {
  test("a save that stays on the page drops the copy and the warning", async () => {
    await open()
    unsaved.keep("typed")
    unsaved.saving()
    unsaved.saved()

    expect(leavingIsWarned()).toBe(false)
    unsaved.keep("typed again")
    expect(leavingIsWarned()).toBe(true)
    await open()
    expect(unsaved.restored).toBe("typed again")
  })

  test("throws away a copy its parser refuses", async () => {
    window.sessionStorage.setItem("csk-hub.unsaved.test", JSON.stringify({ version: "v1", value: 42 }))
    await open()

    expect(unsaved.restored).toBeNull()
    expect(window.sessionStorage.getItem("csk-hub.unsaved.test")).toBeNull()
  })
})
