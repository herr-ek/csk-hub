#!/usr/bin/env bun
// Run with `--conditions=react-server`: the groups module is server-only, and that condition is
// how a server runtime resolves the guard. `bun run ops seed-groups` passes it.
import { db } from "@/core/db"
import { seedGroups } from "@/features/groups"
import { assertLocalDatabase } from "./ops/guards"

assertLocalDatabase("Seeding groups")

const { created } = await seedGroups(db)
await db.$client.end()

console.log(created.length > 0 ? `Created: ${created.join(", ")}` : "Groups were already seeded.")
