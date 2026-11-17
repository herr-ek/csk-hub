import { expect, mock, test } from "bun:test"
import { runInNewContext } from "node:vm"

const script = await Bun.file(new URL("../public/service-worker.js", import.meta.url)).text()

async function click(windows: unknown[], url = "/messages/conversation") {
  const handlers = new Map<string, (event: unknown) => void>()
  const openWindow = mock(async () => ({}))
  const close = mock()
  runInNewContext(script, {
    self: {
      location: { origin: "https://app.test" },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler)
    },
    clients: { matchAll: async () => windows, openWindow },
    URL
  })
  let work: Promise<unknown> | undefined
  handlers.get("notificationclick")?.({
    notification: { close, data: { url } },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise
    }
  })
  await work
  expect(close).toHaveBeenCalledTimes(1)
  return openWindow
}

test("notification clicks focus before navigating an existing app window", async () => {
  const order: string[] = []
  const navigate = mock(async () => {
    order.push("navigate")
    return {}
  })
  const focus = mock(async () => {
    order.push("focus")
    return { navigate }
  })
  const open = await click([{ url: "https://app.test/news", focus }])
  expect(order).toEqual(["focus", "navigate"])
  expect(navigate).toHaveBeenCalledWith("https://app.test/messages/conversation")
  expect(open).not.toHaveBeenCalled()
})

test("an uncontrolled or closed window falls back to opening the target", async () => {
  for (const failure of ["focus", "navigate", "null-navigation"]) {
    const navigate = mock(async () => {
      if (failure === "navigate") throw new TypeError("Uncontrolled")
      return null
    })
    const focus = mock(async () => {
      if (failure === "focus") throw new Error("Closed")
      return { navigate }
    })
    const open = await click([{ url: "https://app.test/news", focus }])
    expect(open).toHaveBeenCalledWith("https://app.test/messages/conversation")
  }
})

test("a failed window does not prevent using another controllable window", async () => {
  const navigate = mock(async () => ({}))
  const open = await click([
    {
      url: "https://app.test/news",
      focus: async () => {
        throw new Error("Closed")
      }
    },
    { url: "https://app.test/", focus: async () => ({ navigate }) }
  ])
  expect(navigate).toHaveBeenCalledTimes(1)
  expect(open).not.toHaveBeenCalled()
})

test("external notification targets fall back to the application home", async () => {
  expect(await click([], "https://other.test")).toHaveBeenCalledWith("https://app.test/")
})
