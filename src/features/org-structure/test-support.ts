import { and, eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { user } from "@/core/db/schema/auth"
import { group, section } from "@/core/db/schema/org-structure"
import { GroupType, type OrgStructureResult, sectionName } from "@/core/org-structure"
import type { Voice } from "@/features/voice/model"
import { createTestDatabase, type TestDatabase } from "../../../test/database"
import { createChoir } from "./structure"

/**
 * The structural Choir and Section fixture shared by domain tests.
 */
const STRUCTURE: {
  choirs: { name: string; sections: { voice: Voice }[] }[]
} = {
  choirs: [
    {
      name: "MK",
      sections: [{ voice: "T1" }, { voice: "T2" }, { voice: "B1" }, { voice: "B2" }]
    },
    {
      name: "DK",
      sections: [{ voice: "S1" }, { voice: "S2" }, { voice: "A1" }, { voice: "A2" }]
    },
    {
      name: "KK",
      sections: [{ voice: "S" }, { voice: "A" }, { voice: "T" }, { voice: "B" }]
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
      const owningChoir = alias(group, "fixture_owning_choir")
      const rows = await db
        .select({ group, choirName: owningChoir.name, sectionVoice: section.voice })
        .from(group)
        .leftJoin(owningChoir, eq(owningChoir.id, group.choirId))
        .leftJoin(section, eq(section.groupId, group.id))
        .where(and(eq(group.active, true), choirId ? eq(group.choirId, choirId) : undefined))
      const row = rows.find(
        ({ group: entry, choirName, sectionVoice }) =>
          (entry.type === GroupType.Section ? sectionName(choirName, sectionVoice) : entry.name) === name
      )?.group
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
