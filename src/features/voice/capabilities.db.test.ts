import { describe, expect } from "bun:test"
import type { TestDatabase } from "@test/database"
import { databaseTest } from "@test/database-test"
import { sql } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { voiceCapability } from "@/core/db/schema/voice"
import { listVoiceCapabilities, setVoiceCapabilities } from "./capabilities"

const test = databaseTest()

describe("voice capabilities", () => {
  async function newUser(t: TestDatabase, name = "Singer") {
    const id = crypto.randomUUID()
    await t.db.insert(user).values({ id, name, email: `${id}@example.com` })
    return id
  }

  test("Lucas sings B2 in KK and can also cover B1", async (t) => {
    const lucas = await newUser(t, "Lucas")
    expect(await setVoiceCapabilities(t.db, lucas, ["B2", "B1", "B1"])).toEqual({ success: true })
    expect(await listVoiceCapabilities(t.db, lucas)).toEqual(["B1", "B2"])
  })

  test("replaces rather than adds", async (t) => {
    const userId = await newUser(t)
    await setVoiceCapabilities(t.db, userId, ["T1", "T2"])
    await setVoiceCapabilities(t.db, userId, ["B1"])
    expect(await listVoiceCapabilities(t.db, userId)).toEqual(["B1"])
    await setVoiceCapabilities(t.db, userId, [])
    expect(await listVoiceCapabilities(t.db, userId)).toEqual([])
  })

  test("refuses a family: capabilities are divisions only", async (t) => {
    const userId = await newUser(t)
    await setVoiceCapabilities(t.db, userId, ["B1"])
    expect(await setVoiceCapabilities(t.db, userId, ["B" as never])).toEqual({
      success: false,
      error: "capability-not-a-division"
    })
    expect(await listVoiceCapabilities(t.db, userId)).toEqual(["B1"])
  })

  describe("schema", () => {
    test("records voice capabilities in divisions only, through the voice_division domain", async (t) => {
      const userId = await newUser(t)
      await expect(
        t.db
          .insert(voiceCapability)
          .values({ userId, voice: "B" as never })
          .execute()
      ).rejects.toMatchObject({ cause: { constraint: "voice_division_check" } })
    })

    test("restricts the voice_family domain to families", async (t) => {
      await expect(Promise.resolve(t.db.execute(sql`SELECT 'B1'::voice_family`))).rejects.toMatchObject({
        cause: { constraint: "voice_family_check" }
      })
    })

    test("compares domain values only through a cast to voice", async (t) => {
      // Postgres finds no `=` for a domain over an enum, not even against a literal or the same domain.
      await expect(Promise.resolve(t.db.execute(sql`SELECT 'B'::voice_family = 'B'::voice`))).rejects.toMatchObject({
        cause: { code: "42883" }
      })
      const { rows } = await t.db.execute(sql`SELECT 'B'::voice_family::voice = 'B'::voice AS same`)
      expect(rows).toEqual([{ same: true }])
    })
  })
})
