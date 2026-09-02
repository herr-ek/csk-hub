#!/usr/bin/env bun
import { eq } from "drizzle-orm"
import { auth } from "@/core/auth"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"

const email = "admin@example.com"
const username = "admin"

const [existingAdmin] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)

if (!existingAdmin) {
  await auth.api.createUser({
    body: {
      email,
      password: "password",
      name: "Admin",
      role: "admin"
    }
  })

  console.log(`Created ${email}.`)
} else {
  console.log(`${email} already exists.`)
}

await db.update(user).set({ emailVerified: true, username }).where(eq(user.email, email))

console.log(`Verified ${email} and set username to ${username}.`)
