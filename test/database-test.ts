import { test } from "bun:test"
import { createTestDatabase, type TestDatabase } from "./database"
import { withTestOutput } from "./output"

/** Tests receive their own migrated database and optional feature fixture. No suite-level state. */
export function databaseTest<T = TestDatabase>(fixture?: (database: TestDatabase) => Promise<T> | T) {
  return (name: string, work: (fixture: T) => Promise<unknown>, timeout = 60_000) => {
    test(
      name,
      () =>
        withTestOutput(name, async () => {
          // Leave time for cleanup before Bun's outer test timeout expires.
          await withTestDatabase(work, fixture, Math.max(1, timeout - 25_000))
        }),
      timeout
    )
  }
}

/** The lifecycle is also callable directly so failure and cleanup behavior can be verified. */
export async function withTestDatabase<T = TestDatabase>(
  work: (fixture: T) => Promise<unknown>,
  fixture?: (database: TestDatabase) => Promise<T> | T,
  executionTimeout = 35_000
) {
  const database = await createTestDatabase()
  let failure: unknown
  let failed = false
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      (async () => {
        const context = fixture ? await fixture(database) : (database as T)
        await work(context)
      })(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error(`Database test body or fixture exceeded ${executionTimeout} ms`)),
          executionTimeout
        )
      })
    ])
  } catch (error) {
    failure = error
    failed = true
  } finally {
    clearTimeout(deadline)
  }
  try {
    await database.drop()
  } catch (error) {
    if (failed) throw new AggregateError([failure, error], "Test and database cleanup failed")
    throw error
  }
  if (failed) throw failure
}
