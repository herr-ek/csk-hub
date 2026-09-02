#!/usr/bin/env bun
import { auth } from "@/core/auth"

const firstNames = ["Alex", "Elin", "Hugo", "Linnea", "Noah", "Saga", "Viktor", "Wilma"]
const lastNames = ["Andersson", "Berg", "Dahl", "Ek", "Lind", "Nilsson", "Sjöberg", "Åström"]
const password = "password"

const randomItem = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]

const members = Array.from({ length: 10 }, () => {
  const name = `${randomItem(firstNames)} ${randomItem(lastNames)}`
  const identifier = crypto.randomUUID().slice(0, 8)

  return { email: `member-${identifier}@example.com`, name }
})

for (const member of members) {
  await auth.api.createUser({
    body: {
      ...member,
      password,
      role: "member"
    }
  })
}

console.log("Created 10 members:")
for (const member of members) console.log(`${member.name} <${member.email}> (password: ${password})`)
