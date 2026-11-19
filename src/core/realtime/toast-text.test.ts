import { expect, test } from "bun:test"
import { activityEventSchema } from "./events"
import { type ActivityToastText, resolveActivityToastText } from "./toast-text"

test("literal content stays literal, even when it resembles a translation key or markup", () => {
  expect(
    resolveActivityToastText("groupMessage <b>{sender}</b>", () => {
      throw new Error("Must not translate user text")
    })
  ).toBe("groupMessage <b>{sender}</b>")
})

test("the same serialized toast resolves in the viewer's locale, including a missing sender fallback", () => {
  const title: ActivityToastText = {
    key: "groupMessage",
    values: { sender: { key: "newMessage" }, conversation: "Planning" }
  }
  for (const fallback of ["New Message", "Nytt meddelande", "Neue Nachricht"]) {
    expect(
      resolveActivityToastText(title, (key, values) =>
        key === "newMessage" ? fallback : `${values?.sender} · ${values?.conversation}`
      )
    ).toBe(`${fallback} · Planning`)
  }
})

test("event validation accepts a common toast independently of event kind and rejects unknown translation keys", () => {
  const event = {
    id: crypto.randomUUID(),
    kind: "notification.created",
    notify: true,
    toast: { title: { key: "notification" }, description: "Broadcast" }
  }
  expect(activityEventSchema.safeParse(event).success).toBe(true)
  expect(activityEventSchema.safeParse({ ...event, kind: "message.created" }).success).toBe(true)
  expect(activityEventSchema.safeParse({ ...event, toast: { title: { key: "missing" } } }).success).toBe(false)
  expect(activityEventSchema.safeParse({ id: event.id, kind: "unread.changed", notify: false }).success).toBe(true)
})
