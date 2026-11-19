import { expect, test } from "bun:test"
import { messageSnippet } from "./message-snippet"

test("collapses whitespace while keeping message content literal", () => {
  expect(messageSnippet("  <b>Hello</b>\n\t  **choir**  ")).toBe("<b>Hello</b> **choir**")
})

test("caps previews without splitting combined emoji and indicates truncation", () => {
  const emoji = "👨‍👩‍👧‍👦"
  expect(messageSnippet(`${"a".repeat(399)}${emoji}tail`)).toBe(`${"a".repeat(399)}${emoji}…`)
  expect(messageSnippet("a".repeat(400))).toBe("a".repeat(400))
  expect(messageSnippet("a".repeat(401))).toBe(`${"a".repeat(400)}…`)
})

test("normalizes whitespace before applying the preview limit", () => {
  expect(messageSnippet(`Hello${"\n ".repeat(400)}world`)).toBe("Hello world")
})
