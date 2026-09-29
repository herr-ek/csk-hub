#!/usr/bin/env bun
import { auth } from "@/core/auth"
import { assertLocalDatabase } from "./ops/guards"

assertLocalDatabase("Seeding users")

const firstNames = ["Alex", "Elin", "Hugo", "Linnea", "Noah", "Saga", "Viktor", "Wilma"]
const lastNames = ["Andersson", "Berg", "Dahl", "Ek", "Lind", "Nilsson", "Sjöberg", "Åström"]
const password = "password"

const randomItem = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]

const users = Array.from({ length: 10 }, () => {
  const name = `${randomItem(firstNames)} ${randomItem(lastNames)}`
  const identifier = crypto.randomUUID().slice(0, 8)

  return { email: `user-${identifier}@example.com`, name }
})

for (const user of users) {
  await auth.api.createUser({
    body: {
      ...user,
      password,
      role: "user"
    }
  })
}

console.log("Created 10 users:")
for (const user of users) console.log(`${user.name} <${user.email}> (password: ${password})`)
