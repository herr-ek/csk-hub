import { describe, expect, test } from "bun:test"
import { MAX_IMPORT_MEMBERS, parseMemberCsv } from "./schemas"

describe("parseMemberCsv", () => {
  test("parses and normalizes valid member rows", () => {
    expect(parseMemberCsv("name,email\nAda Lovelace, ADA@EXAMPLE.COM\nGrace Hopper,grace@example.com")).toEqual({
      rows: [
        { name: "Ada Lovelace", email: "ada@example.com", row: 2 },
        { name: "Grace Hopper", email: "grace@example.com", row: 3 }
      ],
      skipped: []
    })
  })

  test("supports quoted commas and escaped quotes", () => {
    expect(
      parseMemberCsv('name,email\n"Lovelace, Ada",ada@example.com\n"Grace ""Amazing"" Hopper",grace@example.com')
    ).toEqual({
      rows: [
        { name: "Lovelace, Ada", email: "ada@example.com", row: 2 },
        { name: 'Grace "Amazing" Hopper', email: "grace@example.com", row: 3 }
      ],
      skipped: []
    })
  })

  test("finds required headers in any order, ignores extra columns, and rejects invalid headers", () => {
    expect(parseMemberCsv("Voice,email,NAME\nSoprano,ada@example.com,Ada")).toEqual({
      rows: [{ name: "Ada", email: "ada@example.com", row: 2 }],
      skipped: []
    })
    expect(parseMemberCsv("full name,email\nAda,ada@example.com")).toEqual({
      error: "The CSV must include name and email columns."
    })
  })

  test("rejects duplicate emails and more than 50 rows", () => {
    expect(parseMemberCsv("name,email\nAda,ada@example.com\nGrace,ADA@example.com")).toEqual({
      rows: [{ name: "Ada", email: "ada@example.com", row: 2 }],
      skipped: [
        { row: 3, name: "Grace", email: "ada@example.com", error: "The email address is repeated in this CSV." }
      ]
    })
    expect(parseMemberCsv("name,email\nAda,not-an-email")).toEqual({
      rows: [],
      skipped: [{ row: 2, name: "Ada", email: "not-an-email", error: "Email must be a valid email address." }]
    })

    const rows = Array.from(
      { length: MAX_IMPORT_MEMBERS + 1 },
      (_, index) => `Member ${index},member${index}@example.com`
    )
    expect(parseMemberCsv(["name,email", ...rows].join("\n"))).toEqual({
      error: "You can import up to 50 users at a time."
    })
  })
})
