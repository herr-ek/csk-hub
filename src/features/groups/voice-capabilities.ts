import "server-only"

import { eq } from "drizzle-orm"
import { voiceCapability } from "@/core/db/schema/groups"
import type { Voice } from "./model"
import { type GroupsDatabase, lockUser, runGroupsCommand } from "./operation"

/** Replaces what a user can sing. Independent of their Section Memberships. */
export function setVoiceCapabilities(database: GroupsDatabase, userId: string, voices: Voice[]) {
  return runGroupsCommand(database, async (tx) => {
    await lockUser(tx, userId)
    await tx.delete(voiceCapability).where(eq(voiceCapability.userId, userId))
    const distinct = [...new Set(voices)]
    if (distinct.length > 0) await tx.insert(voiceCapability).values(distinct.map((voice) => ({ userId, voice })))
  })
}

export async function listVoiceCapabilities(database: GroupsDatabase, userId: string): Promise<Voice[]> {
  const rows = await database
    .select({ voice: voiceCapability.voice })
    .from(voiceCapability)
    .where(eq(voiceCapability.userId, userId))
    .orderBy(voiceCapability.voice)
  return rows.map(({ voice }) => voice)
}
