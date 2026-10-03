import { and, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { group, position } from "@/core/db/schema/groups"
import { createTestDatabase, type TestDatabase } from "../../../test/database"
import type { GroupsResult } from "./model"
import { seedGroups } from "./seed"

/** A migrated, seeded throwaway database for the groups tests, or undefined without Postgres. */
export async function createGroupsTestDatabase() {
  const database = await createTestDatabase()
  if (!database) return undefined
  await seedGroups(database.db)
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

export type GroupsTestDatabase = ReturnType<typeof fixture>

/** The data of a successful command, failing the test with the violation otherwise. */
export function expectSuccess<T>(result: GroupsResult<T>): T {
  if (!result.success) throw new Error(`Expected success, got violation "${result.error}".`)
  return result.data
}

/** A unique group name, so tests can create groups without colliding. */
export function uniqueName(prefix: string) {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`
}
