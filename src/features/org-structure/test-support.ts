import { and, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { group, position } from "@/core/db/schema/org-structure"
import type { Voice } from "@/features/voice/model"
import { createTestDatabase, type TestDatabase } from "../../../test/database"
import type { GroupType, OrgStructureResult } from "./model"
import { createChoir, createGroup, createPosition } from "./structure"

/**
 * The structure the tests name: the scheme's Choirs and Sections, the Board and the Position
 * catalogue. Production gets the same from `bun run ops reference-data`, which this feature cannot
 * import; this copy is built through the module's own commands instead.
 */
const STRUCTURE: {
  choirs: { name: string; sections: { name: string; voice: Voice }[] }[]
  positions: { name: string; groupTypes: GroupType[] }[]
} = {
  choirs: [
    {
      name: "MK",
      sections: [
        { name: "MKT1", voice: "T1" },
        { name: "MKT2", voice: "T2" },
        { name: "MKB1", voice: "B1" },
        { name: "MKB2", voice: "B2" }
      ]
    },
    {
      name: "DK",
      sections: [
        { name: "DKS1", voice: "S1" },
        { name: "DKS2", voice: "S2" },
        { name: "DKA1", voice: "A1" },
        { name: "DKA2", voice: "A2" }
      ]
    },
    {
      name: "KK",
      sections: [
        { name: "KKS", voice: "S" },
        { name: "KKA", voice: "A" },
        { name: "KKT", voice: "T" },
        { name: "KKB", voice: "B" }
      ]
    }
  ],
  positions: [
    { name: "Ordförande", groupTypes: ["Board"] },
    { name: "Gigmästare", groupTypes: ["Board", "Gigmästeri"] },
    { name: "Sexmästare", groupTypes: ["Board", "Sexmästeri"] },
    { name: "Sexmästarinna", groupTypes: ["Board", "Sexmästeri"] },
    { name: "Conductor", groupTypes: ["Choir"] },
    { name: "Notfiskal", groupTypes: ["Choir"] },
    { name: "Konsertmästare", groupTypes: ["Choir"] },
    { name: "Stämförälder", groupTypes: ["Section"] }
  ]
}

/** A migrated throwaway database with the test structure, or undefined without Postgres. */
export async function createOrgStructureTestDatabase() {
  const database = await createTestDatabase()
  if (!database) return undefined
  for (const choir of STRUCTURE.choirs) expectSuccess(await createChoir(database.db, choir))
  expectSuccess(await createGroup(database.db, { name: "Styret", type: "Board" }))
  for (const position of STRUCTURE.positions) expectSuccess(await createPosition(database.db, position))
  return fixture(database)
}

function fixture({ db, drop }: TestDatabase) {
  return {
    db,
    drop,

    /** A new user; every test makes its own so tests never share Memberships. */
    async user(name = "Singer") {
      const id = crypto.randomUUID()
      await db.insert(user).values({ id, name, email: `${id}@example.com` })
      return id
    },

    /** The id of an active group by name, within a Choir when given. */
    async groupId(name: string, choirName?: string) {
      const choirId = choirName ? await this.groupId(choirName) : undefined
      const [row] = await db
        .select({ id: group.id })
        .from(group)
        .where(and(eq(group.name, name), eq(group.active, true), choirId ? eq(group.choirId, choirId) : undefined))
      if (!row) throw new Error(`No active group named ${name}.`)
      return row.id
    },

    async positionId(name: string) {
      const [row] = await db.select({ id: position.id }).from(position).where(eq(position.name, name))
      if (!row) throw new Error(`No Position named ${name}.`)
      return row.id
    }
  }
}

export type OrgStructureTestDatabase = ReturnType<typeof fixture>

/** The data of a successful command, failing the test with the violation otherwise. */
export function expectSuccess<T>(result: OrgStructureResult<T>): T {
  if (!result.success) throw new Error(`Expected success, got violation "${result.error}".`)
  return result.data
}

/** A unique group name, so tests can create groups without colliding. */
export function uniqueName(prefix: string) {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`
}
