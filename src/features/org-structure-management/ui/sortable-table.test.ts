import { describe, expect, test } from "bun:test"
import { sortRows } from "./sortable-table"

type Row = { name: string; voice: string | null }

const rows: Row[] = [
  { name: "Cecilia", voice: "B1" },
  { name: "Anna", voice: null },
  { name: "Bertil", voice: "A2" },
  { name: "David", voice: "A2" }
]
const byVoice = (a: Row, b: Row) => (a.voice ?? "").localeCompare(b.voice ?? "") || a.name.localeCompare(b.name)
const noVoice = (row: Row) => row.voice === null

describe("sortRows", () => {
  test("sorts by the column, breaking ties with the comparator, and reverses for descending", () => {
    expect(sortRows(rows, byVoice, "asc", noVoice).map(({ name }) => name)).toEqual([
      "Bertil",
      "David",
      "Cecilia",
      "Anna"
    ])
    expect(sortRows(rows, byVoice, "desc", noVoice).map(({ name }) => name)).toEqual([
      "Cecilia",
      "David",
      "Bertil",
      "Anna"
    ])
  })

  test("keeps rows with a missing value last in either direction, and leaves the input alone", () => {
    const copy = [...rows]
    for (const direction of ["asc", "desc"] as const) {
      expect(sortRows(rows, byVoice, direction, noVoice).at(-1)?.name).toBe("Anna")
    }
    expect(rows).toEqual(copy)
  })
})
