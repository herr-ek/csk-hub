import "server-only"

import { and, eq } from "drizzle-orm"
import { choir, group, section } from "@/core/db/schema/org-structure"
import { GROUP_POLICIES, GroupType, hasExplicitGroupName } from "@/core/org-structure"
import { contains, type Voice } from "@/features/voice/model"
import { type OrgStructureDatabase, RuleViolation, runOrgStructureCommand } from "./operation"

/** Every Choir has exactly this many Sections. */
export const SECTIONS_PER_CHOIR = 4

/** Renames a concrete Group while retaining its structural identity. */
export function renameGroup(database: OrgStructureDatabase, groupId: string, name: string) {
  return runOrgStructureCommand(database, async (tx) => {
    const [current] = await tx.select().from(group).where(eq(group.id, groupId)).for("update")
    if (!current) throw new RuleViolation("group-not-found")
    if (!hasExplicitGroupName(current.type)) throw new RuleViolation("group-name-derived")
    const cleanName = name.trim()
    if (!cleanName) throw new RuleViolation("invalid-group-name")
    await tx.update(group).set({ name: cleanName }).where(eq(group.id, groupId))
    return { id: groupId }
  })
}

type CreateChoirInput = {
  name: string
  sections: { name: string; voice: Voice }[]
}

/**
 * Creates a Choir together with its four Sections and the Voice each Section sings. No two Sections
 * overlap: one singing B rules out another singing B1.
 */
export function createChoir(database: OrgStructureDatabase, input: CreateChoirInput) {
  return runOrgStructureCommand(database, async (tx) => {
    if (input.sections.length !== SECTIONS_PER_CHOIR) throw new RuleViolation("section-count")
    const overlapping = input.sections.some((a, i) =>
      input.sections.slice(i + 1).some((b) => contains(a.voice, b.voice) || contains(b.voice, a.voice))
    )
    if (overlapping) throw new RuleViolation("voice-in-several-sections")

    const [choirGroup] = await tx
      .insert(group)
      .values({ name: input.name.trim(), type: GroupType.Choir, choirId: null })
      .returning({ id: group.id })
    if (!choirGroup) throw new Error("Choir creation did not return a record.")
    await tx.insert(choir).values({ groupId: choirGroup.id })

    const sections = []
    for (const definition of input.sections) {
      const [created] = await tx
        .insert(group)
        .values({ name: definition.name.trim(), type: GroupType.Section, choirId: choirGroup.id })
        .returning({ id: group.id })
      if (!created) throw new Error("Section creation did not return a record.")
      await tx.insert(section).values({ groupId: created.id, voice: definition.voice })
      sections.push({ id: created.id, name: definition.name.trim(), voice: definition.voice })
    }

    return { choirId: choirGroup.id, sections }
  })
}

/**
 * Archives a non-annual group; groups are never deleted, so their history stays intact. Archiving a Choir
 * archives its Sections with it, and a Section is never archived on its own. Memberships and
 * appointments retain their dates. Annual Groups complete automatically with their organisational year.
 */
export function archiveGroup(database: OrgStructureDatabase, groupId: string) {
  return runOrgStructureCommand(database, async (tx) => {
    const [row] = await tx.select().from(group).where(eq(group.id, groupId)).for("update")
    if (!row) throw new RuleViolation("group-not-found")
    if (GROUP_POLICIES[row.type].lifetime === "annual") throw new RuleViolation("annual-group-lifecycle-derived")
    if (!row.active) throw new RuleViolation("group-archived")
    if (row.type === GroupType.Section) throw new RuleViolation("section-archived-with-choir")

    await tx.update(group).set({ active: false }).where(eq(group.id, groupId))
    if (row.type === GroupType.Choir) {
      await tx
        .update(group)
        .set({ active: false })
        .where(and(eq(group.choirId, groupId), eq(group.type, GroupType.Section)))
    }
  })
}
