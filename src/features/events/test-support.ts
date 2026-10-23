import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { choir, group } from "@/core/db/schema/org-structure"
import { createTestDatabase, type TestDatabase } from "../../../test/database"
import type { EventInput } from "./events"
import type { EventResult } from "./model"

/**
 * A migrated throwaway database, or undefined without Postgres. Events only point at groups, so
 * the groups the tests name are written directly rather than through the org-structure module,
 * which this feature reaches only through its entrypoint.
 */
export async function createEventsTestDatabase() {
  const database = await createTestDatabase()
  if (!database) return undefined
  return fixture(database)
}

function fixture({ db, drop }: TestDatabase) {
  return {
    db,
    drop,

    async user(name = "Singer") {
      const id = crypto.randomUUID()
      await db.insert(user).values({ id, name, email: `${id}@example.com` })
      return id
    },

    /** A new Choir group, named uniquely unless a name is given. */
    async choir(name = uniqueName("Choir")) {
      const [row] = await db.insert(group).values({ name, type: "Choir" }).returning({ id: group.id })
      if (!row) throw new Error("No Choir created.")
      await db.insert(choir).values({ groupId: row.id })
      return row.id
    },

    /** A new group of another type; a Section needs its Choir. */
    async group(type: Exclude<(typeof group.type.enumValues)[number], "Choir">, choirId: string | null = null) {
      const [row] = await db
        .insert(group)
        .values({ name: uniqueName(type), type, choirId })
        .returning({ id: group.id })
      if (!row) throw new Error("No group created.")
      return row.id
    },

    async archiveGroup(groupId: string) {
      await db.update(group).set({ active: false }).where(eq(group.id, groupId))
    }
  }
}

export type EventsTestDatabase = ReturnType<typeof fixture>

/** A timed Event's form with nothing optional filled in. */
export function eventInput(overrides: Partial<EventInput> = {}): EventInput {
  return {
    type: "Meeting",
    title: "Styrelsemöte",
    schedule: {
      allDay: false,
      startsAt: new Date("2026-11-03T17:00:00Z"),
      endsAt: new Date("2026-11-03T19:00:00Z")
    },
    ...overrides
  }
}

/** The data of a successful command, failing the test with the violation otherwise. */
export function expectSuccess<T>(result: EventResult<T>): T {
  if (!result.success) throw new Error(`Expected success, got violation "${result.error}".`)
  return result.data
}

export function uniqueName(prefix: string) {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`
}
