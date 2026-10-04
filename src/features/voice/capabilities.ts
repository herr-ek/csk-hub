import "server-only"

import { eq, sql } from "drizzle-orm"
import type { db } from "@/core/db"
import { voiceCapability } from "@/core/db/schema/voice"
import { isVoiceDivision, type VoiceDivision } from "./model"

/** The application database client, or a transaction on it. */
export type VoiceDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export type SetVoiceCapabilitiesResult = { success: true } | { success: false; error: "capability-not-a-division" }

/**
 * Replaces what a user can sing. Independent of their Section Memberships, and in divisions only:
 * someone who can sing B can sing B1 and B2. Given a transaction, it nests as a savepoint.
 */
export async function setVoiceCapabilities(
  database: VoiceDatabase,
  userId: string,
  voices: VoiceDivision[]
): Promise<SetVoiceCapabilitiesResult> {
  // The type rules families out, but callers may hold a widened Voice.
  if (!voices.every(isVoiceDivision)) return { success: false, error: "capability-not-a-division" }

  await database.transaction(async (tx) => {
    // Serializes concurrent replacements for one user, which would otherwise collide on the key.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`voice:user:${userId}`}))`)
    await tx.delete(voiceCapability).where(eq(voiceCapability.userId, userId))
    const distinct = [...new Set(voices)]
    if (distinct.length > 0) await tx.insert(voiceCapability).values(distinct.map((voice) => ({ userId, voice })))
  })
  return { success: true }
}

export async function listVoiceCapabilities(database: VoiceDatabase, userId: string): Promise<VoiceDivision[]> {
  const rows = await database
    .select({ voice: voiceCapability.voice })
    .from(voiceCapability)
    .where(eq(voiceCapability.userId, userId))
    .orderBy(voiceCapability.voice)
  return rows.map(({ voice }) => voice)
}
