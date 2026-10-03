import "server-only"

import { and, eq } from "drizzle-orm"
import { choir, group, groupTypePosition, position, sectionVoice } from "@/core/db/schema/groups"
import { requireChoir, requireGroup } from "./lookup"
import type { GroupType, Voice } from "./model"
import { type GroupsDatabase, type GroupsTransaction, RuleViolation, runGroupsCommand } from "./operation"

/** Every Choir has exactly this many Sections. */
export const SECTIONS_PER_CHOIR = 4

type CreateGroupInput = {
  name: string
  type: Exclude<GroupType, "Choir" | "Section">
  /** The Choir the group belongs to; omitted for a CSK-wide group. */
  choirId?: string | null
}

/** Creates a CSK-wide group, or one that belongs to a Choir. Choirs and Sections come from `createChoir`. */
export function createGroup(database: GroupsDatabase, input: CreateGroupInput) {
  return runGroupsCommand(database, async (tx) => {
    // The type excludes these, but callers may hold a widened GroupType.
    if ((input.type as GroupType) === "Choir" || (input.type as GroupType) === "Section") {
      throw new RuleViolation("choir-created-with-sections")
    }
    const choirId = input.choirId ?? null
    if (choirId) await requireChoir(tx, choirId)

    const [created] = await tx
      .insert(group)
      .values({ name: input.name.trim(), type: input.type, choirId })
      .returning({ id: group.id })
    if (!created) throw new Error("Group creation did not return a record.")
    return created
  })
}

type CreateChoirInput = {
  name: string
  sections: { name: string; voices: Voice[] }[]
}

/** Creates a Choir together with its four Sections and the Voices each Section sings. */
export function createChoir(database: GroupsDatabase, input: CreateChoirInput) {
  return runGroupsCommand(database, async (tx) => {
    if (input.sections.length !== SECTIONS_PER_CHOIR) throw new RuleViolation("section-count")
    if (input.sections.some((section) => section.voices.length === 0)) throw new RuleViolation("section-without-voice")
    const voices = input.sections.flatMap((section) => section.voices)
    if (new Set(voices).size !== voices.length) throw new RuleViolation("voice-in-several-sections")

    const [choirGroup] = await tx
      .insert(group)
      .values({ name: input.name.trim(), type: "Choir", choirId: null })
      .returning({ id: group.id })
    if (!choirGroup) throw new Error("Choir creation did not return a record.")
    await tx.insert(choir).values({ groupId: choirGroup.id })

    const sections = []
    for (const section of input.sections) {
      const [created] = await tx
        .insert(group)
        .values({ name: section.name.trim(), type: "Section", choirId: choirGroup.id })
        .returning({ id: group.id })
      if (!created) throw new Error("Section creation did not return a record.")
      await tx.insert(sectionVoice).values(section.voices.map((voice) => ({ sectionId: created.id, voice })))
      sections.push({ id: created.id, name: section.name.trim(), voices: section.voices })
    }

    return { choirId: choirGroup.id, sections }
  })
}

/**
 * Archives a group; groups are never deleted, so their history stays intact. Archiving a Choir
 * archives its Sections with it, and a Section is never archived on its own.
 */
export function archiveGroup(database: GroupsDatabase, groupId: string) {
  return runGroupsCommand(database, async (tx) => {
    const row = await requireGroup(tx, groupId)
    if (!row.active) throw new RuleViolation("group-archived")
    if (row.type === "Section") throw new RuleViolation("section-archived-with-choir")

    await tx.update(group).set({ active: false }).where(eq(group.id, groupId))
    if (row.type === "Choir") {
      await tx
        .update(group)
        .set({ active: false })
        .where(and(eq(group.choirId, groupId), eq(group.type, "Section")))
    }
  })
}

type CreatePositionInput = {
  name: string
  /** The GroupTypes this Position may be held in. */
  groupTypes: GroupType[]
}

export function createPosition(database: GroupsDatabase, input: CreatePositionInput) {
  return runGroupsCommand(database, async (tx) => {
    const [created] = await tx.insert(position).values({ name: input.name.trim() }).returning({ id: position.id })
    if (!created) throw new Error("Position creation did not return a record.")
    await allowPosition(tx, created.id, input.groupTypes)
    return created
  })
}

/** Allows an existing Position in further GroupTypes. */
export function allowPositionInGroupTypes(database: GroupsDatabase, positionId: string, groupTypes: GroupType[]) {
  return runGroupsCommand(database, async (tx) => {
    const [row] = await tx.select({ id: position.id }).from(position).where(eq(position.id, positionId))
    if (!row) throw new RuleViolation("position-not-found")
    await allowPosition(tx, positionId, groupTypes)
  })
}

async function allowPosition(tx: GroupsTransaction, positionId: string, groupTypes: GroupType[]) {
  if (groupTypes.length === 0) return
  await tx
    .insert(groupTypePosition)
    .values(groupTypes.map((type) => ({ type, positionId })))
    .onConflictDoNothing()
}
