#!/usr/bin/env bun
import { randomBytes } from "node:crypto"
import { hashPassword } from "better-auth/crypto"
import { and, eq } from "drizzle-orm"
import { auth } from "@/core/auth"
import { db } from "@/core/db"
import { account, user } from "@/core/db/schema/auth"
import { isLocalDatabase } from "@/core/db/tls"
import { SEED_PASSWORD } from "./ops/seed-data"

// Also runs against production through `bun run ops seed-admin --prod`, so only a local database gets the fixed password.
const local = isLocalDatabase(process.env.POSTGRES_URL ?? "")
const email = "admin@example.com"
const username = "admin"

const [existingAdmin] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)

if (!existingAdmin) {
  const password = local ? SEED_PASSWORD : randomBytes(18).toString("base64url")

  await auth.api.createUser({
    body: {
      email,
      password,
      name: "Admin",
      role: "admin"
    }
  })

  console.log(`Created ${email} with password: ${password}`)
  if (!local) console.log("It is shown only once. Sign in and change it.")
} else if (local) {
  await db
    .update(account)
    .set({ password: await hashPassword(SEED_PASSWORD) })
    .where(and(eq(account.userId, existingAdmin.id), eq(account.providerId, "credential")))
  console.log(`${email} already exists; its password is now: ${SEED_PASSWORD}`)
} else {
  console.log(`${email} already exists; its password is unchanged.`)
}

await db.update(user).set({ emailVerified: true, username }).where(eq(user.email, email))

console.log(`Verified ${email} and set username to ${username}.`)
