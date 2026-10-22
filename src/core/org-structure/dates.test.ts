import { describe, expect, test } from "bun:test"
import {
  annualAppointmentDefaults,
  currentOrganisationYear,
  isAllowedOrganisationYear,
  periodsCoverPeriod
} from "./dates"

describe("organisation date helpers", () => {
  test("annual appointment defaults use an available current year and bound its final day", () => {
    expect(annualAppointmentDefaults([2027, 2026], "2026-10-21")).toEqual({
      year: 2026,
      startDate: "2026-10-21",
      lastDay: "2027-06-30",
      min: "2026-07-01",
      max: "2027-06-30"
    })
    expect(annualAppointmentDefaults([2027, 2026], "2027-02-01")).toMatchObject({
      year: 2026,
      startDate: "2027-02-01",
      lastDay: "2027-06-30"
    })
    expect(annualAppointmentDefaults([2027, 2026], "2026-06-30")).toMatchObject({
      year: 2026,
      startDate: "2026-07-01",
      min: "2026-07-01",
      max: "2027-06-30"
    })
  })

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
