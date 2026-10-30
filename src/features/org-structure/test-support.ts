import { and, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { group } from "@/core/db/schema/org-structure"
import type { GroupType, OrgStructureResult } from "@/core/org-structure"
import type { Voice } from "@/features/voice/model"
import { createTestDatabase, type TestDatabase } from "../../../test/database"
import { createChoir } from "./structure"

/**
 * The structural Choir and Section fixture shared by domain tests.
 */
const STRUCTURE: {
  choirs: { name: string; sections: { name: string; voice: Voice }[] }[]
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
  ]
}

/** A migrated throwaway database with the test structure, or undefined without Postgres. */
export async function createOrgStructureTestDatabase() {
  const database = await createTestDatabase()
  if (!database) return undefined
  for (const choir of STRUCTURE.choirs) expectSuccess(await createChoir(database.db, choir))
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

    /** A singleton Group identity, independent of its localized label. */
    async groupIdOfType(type: GroupType) {
      const [row] = await db
        .select({ id: group.id })
        .from(group)
        .where(and(eq(group.type, type), eq(group.active, true)))
      if (!row) throw new Error(`No active Group of type ${type}.`)
      return row.id
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
