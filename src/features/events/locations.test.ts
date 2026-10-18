import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { location } from "@/core/db/schema/events"
import { archiveLocation, createLocation, updateLocation } from "./locations"
import { createEventsTestDatabase, expectSuccess, uniqueName } from "./test-support"

const database = await createEventsTestDatabase()

describe.skipIf(!database)("Locations", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())

  async function locationRow(id: string) {
    const [row] = await t.db.select().from(location).where(eq(location.id, id))
    return row
  }

  test("creates, edits and archives a Location", async () => {
    const name = uniqueName("Kårhuset")
    const { id } = expectSuccess(
      await createLocation(t.db, { name: ` ${name} `, address: "Chalmersplatsen 1", mapUrl: "" })
    )
    expect(await locationRow(id)).toEqual({ id, name, address: "Chalmersplatsen 1", mapUrl: null, active: true })

    expectSuccess(await updateLocation(t.db, id, { name, address: null, mapUrl: "https://maps.example.com/?q=1" }))
    expect(await locationRow(id)).toMatchObject({ address: null, mapUrl: "https://maps.example.com/?q=1" })

    expectSuccess(await archiveLocation(t.db, id))
    expect((await locationRow(id))?.active).toBe(false)
    expect(await archiveLocation(t.db, id)).toEqual({ success: false, error: "location-archived" })
    expect(await updateLocation(t.db, id, { name })).toEqual({ success: false, error: "location-archived" })
  })

  test("keeps names unique among active Locations only", async () => {
    const name = uniqueName("Rehearsal room")
    const first = expectSuccess(await createLocation(t.db, { name }))
    expect(await createLocation(t.db, { name })).toEqual({ success: false, error: "location-name-taken" })

    expectSuccess(await archiveLocation(t.db, first.id))
    expectSuccess(await createLocation(t.db, { name }))
  })

  test("refuses a blank name and a map link that is not a web address", async () => {
    expect(await createLocation(t.db, { name: "  " })).toEqual({ success: false, error: "location-name-required" })
    expect(await createLocation(t.db, { name: uniqueName("Hall"), mapUrl: "javascript:alert(1)" })).toEqual({
      success: false,
      error: "invalid-map-url"
    })
    expect(await updateLocation(t.db, crypto.randomUUID(), { name: "X" })).toEqual({
      success: false,
      error: "location-not-found"
    })
  })
})
