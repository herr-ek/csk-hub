#!/usr/bin/env bun
// Run with `--conditions=react-server`: the groups module is server-only, and that condition is
// how a server runtime resolves the guard. `bun run ops seed-groups` passes it.
import { db } from "@/core/db"
import { seedGroups } from "@/features/groups"
import { assertLocalDatabase } from "./ops/guards"

assertLocalDatabase("Seeding groups")

const { created, placed } = await seedGroups(db)
await db.$client.end()

console.log(created.length > 0 ? `Created groups: ${created.join(", ")}` : "Example groups already exist.")
console.log(`Placed ${placed} user(s) in a Section.`)
