import { afterAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { createAuthorization } from "@/core/authz/authorization"
import { user } from "@/core/db/schema/auth"
import { listVoiceCapabilities, setVoiceCapabilities } from "@/features/voice"
import { createTestDatabase } from "../../../../test/database"
import { getOwnVoiceCapabilities, saveOwnVoiceCapabilities as saveCapabilities } from "./service"

const database = await createTestDatabase()

describe.skipIf(!database)("Self-reported profile capabilities", () => {
  if (!database) return
  const { db, drop } = database
  afterAll(drop)
  function saveOwnVoiceCapabilities(
    database: typeof db,
    actor: { userId: string; impersonating: boolean } | null,
    input: unknown
  ) {
    const authorize = createAuthorization({
      database,
      readSession: async () =>
        actor ? { user: { id: actor.userId }, session: { impersonatedBy: actor.impersonating ? "admin" : null } } : null
    }).requirePermission
    return saveCapabilities(database, actor, input, authorize)
  }
  async function member() {
    const id = crypto.randomUUID()
    await db.insert(user).values({ id, name: "Singer", email: `${id}@example.com` })
    return { userId: id, impersonating: false }
  }

  test("replaces and clears only the authenticated actor's capabilities", async () => {
    const actor = await member()
    const other = await member()
    await setVoiceCapabilities(db, actor.userId, ["S1"])
    await setVoiceCapabilities(db, other.userId, ["T2"])
    expect(await saveOwnVoiceCapabilities(db, actor, ["B2", "B1", "B1"])).toEqual({
      status: "success",
      voices: ["B1", "B2"]
    })
    expect(await getOwnVoiceCapabilities(db, actor.userId)).toEqual(["B1", "B2"])
    expect(await listVoiceCapabilities(db, other.userId)).toEqual(["T2"])
    expect(await saveOwnVoiceCapabilities(db, actor, [])).toEqual({ status: "success", voices: [] })
    expect(await getOwnVoiceCapabilities(db, actor.userId)).toEqual([])
  })

  test("rejects invalid submitted values without replacing existing capabilities", async () => {
    const actor = await member()
    await setVoiceCapabilities(db, actor.userId, ["B1"])
    for (const input of [
      ["B"],
      ["B3"],
      ["unknown"],
      [null],
      [new File(["B1"], "voice.txt")],
      "B1",
      Array(9).fill("B1")
    ]) {
      expect(await saveOwnVoiceCapabilities(db, actor, input)).toEqual({ status: "error", error: "invalid-voices" })
    }
    expect(await getOwnVoiceCapabilities(db, actor.userId)).toEqual(["B1"])
  })

  test("refuses unauthenticated and impersonated edits", async () => {
    const actor = await member()
    await setVoiceCapabilities(db, actor.userId, ["A1"])
    expect(await saveOwnVoiceCapabilities(db, null, ["B1"])).toEqual({ status: "error", error: "sign-in-required" })
    expect(await saveOwnVoiceCapabilities(db, { ...actor, impersonating: true }, ["B1"])).toEqual({
      status: "error",
      error: "impersonation-unavailable"
    })
    expect(await getOwnVoiceCapabilities(db, actor.userId)).toEqual(["A1"])
  })

  test("a stale edit form cannot write after the actor is deactivated or erased", async () => {
    const actor = await member()
    await setVoiceCapabilities(db, actor.userId, ["T1"])
    await db.update(user).set({ banned: true }).where(eq(user.id, actor.userId))
    expect(await saveOwnVoiceCapabilities(db, actor, ["B1"])).toEqual({ status: "error", error: "inactive-user" })
    expect(await listVoiceCapabilities(db, actor.userId)).toEqual(["T1"])
    expect(await saveOwnVoiceCapabilities(db, { userId: "missing", impersonating: false }, ["B1"])).toEqual({
      status: "error",
      error: "inactive-user"
    })
  })
})
