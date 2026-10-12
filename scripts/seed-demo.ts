#!/usr/bin/env bun
import { Client } from "pg"
import { assertLocalDatabase } from "./ops/guards"
import { insertReferenceData } from "./ops/reference-data"
import { SEED_PASSWORD, type SeedDatabase } from "./ops/seed-data"
import { seedGroups } from "./seed-groups"
import { seedPosts } from "./seed-posts"
import { seedUsers } from "./seed-users"

/** Seeds people, placements, group history and Posts together; any fixture conflict rolls back this demo transaction. */
export async function seedDemo(database: SeedDatabase) {
  return database.transaction(async (tx) => ({
    users: await seedUsers(tx),
    groups: await seedGroups(tx),
    posts: await seedPosts(tx)
  }))
}

if (import.meta.main) {
  assertLocalDatabase("Seeding the demo")
  const { db } = await import("@/core/db")
  const client = new Client({ connectionString: process.env.POSTGRES_URL })
  try {
    await client.connect()
    await insertReferenceData(client)
    const result = await seedDemo(db)
    console.log(
      `Created ${result.users.created} users, ${result.groups.created.length} groups and ${result.posts.created} Posts; placed ${result.groups.placed} singers.`
    )
    console.log(
      `Login: singer-001@example.com … singer-100@example.com. Password: ${SEED_PASSWORD}. First three: Admins.`
    )
  } finally {
    await client.end()
    await db.$client.end()
  }
}
