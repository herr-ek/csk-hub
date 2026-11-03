import { describe, expect, test } from "bun:test"
import { currentOrganisationYear, isAllowedOrganisationYear, periodsCoverPeriod } from "./dates"

describe("organisation date helpers", () => {
  test("coverage ignores expired prefixes and honors exact exclusive boundaries", () => {
    expect(
      periodsCoverPeriod(
        [
          { startDate: "2025-01-01", endDate: "2025-12-31" },
          { startDate: "2026-01-01", endDate: "2026-04-01" },
          { startDate: "2026-03-15", endDate: "2026-08-01" }
        ],
        { startDate: "2026-01-01", endDate: "2026-08-01" }
      )
    ).toBe(true)
  })

  test("continuous periods cover adjacent boundaries and reject a gap or a finite open-ended target", () => {
    expect(
      periodsCoverPeriod(
        [
          { startDate: "2026-01-01", endDate: "2026-06-01" },
          { startDate: "2026-06-01", endDate: "2026-12-01" }
        ],
        { startDate: "2026-02-01", endDate: "2026-12-01" }
      )
    ).toBe(true)
    expect(
      periodsCoverPeriod(
        [
          { startDate: "2026-01-01", endDate: "2026-05-31" },
          { startDate: "2026-06-01", endDate: null }
        ],
        { startDate: "2026-02-01", endDate: null }
      )
    ).toBe(false)
    expect(
      periodsCoverPeriod([{ startDate: "2026-01-01", endDate: null }], {
        startDate: "2026-02-01",
        endDate: null
      })
    ).toBe(true)
  })
})

test("annual preparation bounds follow the July boundary and allow historical backfilling", () => {
  expect(currentOrganisationYear("2027-06-30")).toBe(2026)
  expect(currentOrganisationYear("2027-07-01")).toBe(2027)
  expect(isAllowedOrganisationYear(2028, "2027-06-30")).toBe(false)
  expect(isAllowedOrganisationYear(2028, "2027-07-01")).toBe(true)
  expect(isAllowedOrganisationYear(2025, "2027-07-01")).toBe(true)
})
