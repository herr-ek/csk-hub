#!/usr/bin/env bun
import { hashPassword } from "better-auth/crypto"
import { inArray } from "drizzle-orm"
import { account, user } from "@/core/db/schema/auth"
import { assertLocalDatabase } from "./ops/guards"
import { SEED_PASSWORD, SEED_USERS, type SeedDatabase } from "./ops/seed-data"

/**
 * Creates 100 named, verified local accounts, with three Admins to author the example Posts.
 * Stable identities make reruns additive; existing accounts and credentials are never reset.
 * Uses Better Auth's password format directly, without sending invites or loading app modules.
 */
export async function seedUsers(database: SeedDatabase) {
  return database.transaction(async (tx) => {
    const existing = await tx
      .select({ id: user.id })
      .from(user)
      .where(
        inArray(
          user.id,
          SEED_USERS.map(({ id }) => id)
        )
      )
    const missing = SEED_USERS.filter(({ id }) => !existing.some((row) => row.id === id))
    for (const singer of missing) {
      const password = await hashPassword(SEED_PASSWORD)
      await tx.insert(user).values({
        id: singer.id,
        name: singer.name,
        email: singer.email,
        username: singer.username,
        displayUsername: singer.username,
        role: singer.role,
        emailVerified: true,
        createdAt: new Date(`${singer.joined}T12:00:00Z`)
      })
      await tx.insert(account).values({
        id: `${singer.id}-credential`,
        accountId: singer.id,
        providerId: "credential",
        userId: singer.id,
        password
      })
    }
    return { created: missing.length }
  })
}

if (import.meta.main) {
  assertLocalDatabase("Seeding users")
  const { db } = await import("@/core/db")
  try {
    const { created } = await seedUsers(db)
    console.log(`Created ${created} of 100 example users. Login: singer-001@example.com … singer-100@example.com.`)
    console.log(`The first three are Admins. Password: ${SEED_PASSWORD}`)
  } finally {
    await db.$client.end()
  }
}
