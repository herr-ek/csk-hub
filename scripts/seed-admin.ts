#!/usr/bin/env bun
import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { auth } from "@/core/auth"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"

// Runs against production through `bun run ops seed-admin --prod`, so no fixed password.
const email = "admin@example.com"
const username = "admin"

const [existingAdmin] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)

if (!existingAdmin) {
  const password = randomBytes(18).toString("base64url")

  await auth.api.createUser({
    body: {
      email,
      password,
      name: "Admin",
      role: "admin"
    }
  })

  console.log(`Created ${email} with password: ${password}`)
  console.log("It is shown only once. Sign in and change it.")
} else {
  console.log(`${email} already exists; its password is unchanged.`)
}

await db.update(user).set({ emailVerified: true, username }).where(eq(user.email, email))

console.log(`Verified ${email} and set username to ${username}.`)
