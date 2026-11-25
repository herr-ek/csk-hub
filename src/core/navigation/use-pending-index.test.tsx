import { afterEach, describe, expect, test } from "bun:test"
import { registerDom } from "@test/dom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { usePendingIndex } from "./use-pending-index"

registerDom()
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let pending: ReturnType<typeof usePendingIndex>

function Bar({ pathname }: { pathname: string }) {
  pending = usePendingIndex(pathname)
  return null
}

async function visit(pathname: string) {
  if (!root) root = createRoot(document.body.appendChild(document.createElement("div")))
  await act(async () => root?.render(<Bar pathname={pathname} />))
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
})

describe("the link held while its page loads", () => {
  test("is held until the path changes", async () => {
    await visit("/news")
    await act(async () => pending[1](0))
    expect(pending[0]).toBe(0)

    await visit("/events")
    expect(pending[0]).toBeNull()
  })

  test("doesn't come back when Back returns to the page it was chosen on", async () => {
    await visit("/news")
    await act(async () => pending[1](0))
    await visit("/events")
    await visit("/news")
    expect(pending[0]).toBeNull()
  })
})
