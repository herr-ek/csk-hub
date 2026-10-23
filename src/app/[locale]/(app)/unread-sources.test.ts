import { expect, mock, test } from "bun:test"

mock.module("@/core/db", () => ({ db: {} }))
mock.module("@/core/auth/session.server", () => ({ getRequestSession: async () => null }))
mock.module("next/cache", () => ({ refresh: mock(), revalidatePath: mock() }))

const { getUnreadSource } = await import("@/core/navigation/unread-sources")
await import("./unread-sources")

// Registration is a side effect of importing a feature; a dropped import would only show as a
// badge that silently stops appearing.
test("the layout subscribes the News and Messages badges", () => {
  expect(getUnreadSource("news")).toBeFunction()
  expect(getUnreadSource("messages")).toBeFunction()
})
