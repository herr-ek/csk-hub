import "server-only"

import { and, eq, inArray, isNull, notInArray } from "drizzle-orm"
import {
  choir,
  group,
  groupTypePosition,
  position,
  positionGroup,
  positionHolder,
  section
} from "@/core/db/schema/org-structure"
import { contains, type Voice } from "@/features/voice/model"
import { requireChoir, requireGroup } from "./lookup"
import type { GroupType } from "./model"
import {
  type OrgStructureDatabase,
  type OrgStructureTransaction,
  RuleViolation,
  runOrgStructureCommand
} from "./operation"

/** Every Choir has exactly this many Sections. */
export const SECTIONS_PER_CHOIR = 4

type CreateGroupInput = {
  name: string
  type: Exclude<GroupType, "Choir" | "Section">
  /** The Choir the group belongs to; omitted for a CSK-wide group. */
  choirId?: string | null
}

/** Creates a CSK-wide group, or one that belongs to a Choir. Choirs and Sections come from `createChoir`. */
export function createGroup(database: OrgStructureDatabase, input: CreateGroupInput) {
  return runOrgStructureCommand(database, async (tx) => {
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
      .values({ name: input.name.trim(), type: "Choir", choirId: null })
      .returning({ id: group.id })
    if (!choirGroup) throw new Error("Choir creation did not return a record.")
    await tx.insert(choir).values({ groupId: choirGroup.id })

    const sections = []
    for (const definition of input.sections) {
      const [created] = await tx
        .insert(group)
        .values({ name: definition.name.trim(), type: "Section", choirId: choirGroup.id })
        .returning({ id: group.id })
      if (!created) throw new Error("Section creation did not return a record.")
      await tx.insert(section).values({ groupId: created.id, voice: definition.voice })
      sections.push({ id: created.id, name: definition.name.trim(), voice: definition.voice })
    }

    return { choirId: choirGroup.id, sections }
  })
}

/** Renames an active group. Names stay unique among active groups within the same Choir. */
export function renameGroup(database: OrgStructureDatabase, groupId: string, name: string) {
  return runOrgStructureCommand(database, async (tx) => {
    const row = await requireGroup(tx, groupId)
    if (!row.active) throw new RuleViolation("group-archived")
    await tx.update(group).set({ name: name.trim() }).where(eq(group.id, groupId))
  })
}

/**
 * Archives a group; groups are never deleted, so their history stays intact. Archiving a Choir
 * archives its Sections with it, and a Section is never archived on its own.
 */
export function archiveGroup(database: OrgStructureDatabase, groupId: string) {
  return runOrgStructureCommand(database, async (tx) => {
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
  /** The groups it is limited to, each of an allowed type; omitted or empty for every such group. */
  groupIds?: string[]
}

export function createPosition(database: OrgStructureDatabase, input: CreatePositionInput) {
  return runOrgStructureCommand(database, async (tx) => {
    const [created] = await tx.insert(position).values({ name: input.name.trim() }).returning({ id: position.id })
    if (!created) throw new Error("Position creation did not return a record.")
    await allowPosition(tx, created.id, input.groupTypes)
    await applyPositionGroups(tx, created.id, input.groupIds ?? [])
    return created
  })
}

/** Allows an existing Position in further GroupTypes. */
export function allowPositionInGroupTypes(database: OrgStructureDatabase, positionId: string, groupTypes: GroupType[]) {
  return runOrgStructureCommand(database, async (tx) => {
    const [row] = await tx.select({ id: position.id }).from(position).where(eq(position.id, positionId))
    if (!row) throw new RuleViolation("position-not-found")
    await allowPosition(tx, positionId, groupTypes)
  })
}

async function allowPosition(tx: OrgStructureTransaction, positionId: string, groupTypes: GroupType[]) {
  if (groupTypes.length === 0) return
  await tx
    .insert(groupTypePosition)
    .values(groupTypes.map((type) => ({ type, positionId })))
    .onConflictDoNothing()
}

export function renamePosition(database: OrgStructureDatabase, positionId: string, name: string) {
  return runOrgStructureCommand(database, (tx) => applyPositionName(tx, positionId, name))
}

/**
 * Replaces the GroupTypes a Position may be held in. A type cannot be withdrawn while someone
 * currently holds the Position in a group of that type.
 */
export function setPositionGroupTypes(database: OrgStructureDatabase, positionId: string, groupTypes: GroupType[]) {
  return runOrgStructureCommand(database, (tx) => applyPositionGroupTypes(tx, positionId, groupTypes))
}

/**
 * Replaces the groups a Position is limited to; an empty list lifts the limit. Each group must be
 * of a type the Position is allowed in, and a group cannot be left out while someone currently
 * holds the Position there.
 */
export function setPositionGroups(database: OrgStructureDatabase, positionId: string, groupIds: string[]) {
  return runOrgStructureCommand(database, (tx) => applyPositionGroups(tx, positionId, groupIds))
}

/** Renames a Position and replaces its GroupTypes and its limit to groups as one change, or none. */
export function updatePosition(
  database: OrgStructureDatabase,
  input: { positionId: string; name: string; groupTypes: GroupType[]; groupIds?: string[] }
) {
  return runOrgStructureCommand(database, async (tx) => {
    await applyPositionName(tx, input.positionId, input.name)
    await applyPositionGroupTypes(tx, input.positionId, input.groupTypes)
    await applyPositionGroups(tx, input.positionId, input.groupIds ?? [])
  })
}

async function applyPositionName(tx: OrgStructureTransaction, positionId: string, name: string) {
  const renamed = await tx
    .update(position)
    .set({ name: name.trim() })
    .where(eq(position.id, positionId))
    .returning({ id: position.id })
  if (renamed.length === 0) throw new RuleViolation("position-not-found")
}

async function applyPositionGroupTypes(tx: OrgStructureTransaction, positionId: string, groupTypes: GroupType[]) {
  const [row] = await tx.select({ id: position.id }).from(position).where(eq(position.id, positionId)).for("update")
  if (!row) throw new RuleViolation("position-not-found")

  const kept = [...new Set(groupTypes)]
  const [held] = await tx
    .select({ type: group.type })
    .from(positionHolder)
    .innerJoin(group, eq(group.id, positionHolder.groupId))
    .where(
      and(
        eq(positionHolder.positionId, positionId),
        isNull(positionHolder.endDate),
        kept.length > 0 ? notInArray(group.type, kept) : undefined
      )
    )
    .limit(1)
  if (held) throw new RuleViolation("position-in-use")

  await tx
    .delete(groupTypePosition)
    .where(
      and(
        eq(groupTypePosition.positionId, positionId),
        kept.length > 0 ? notInArray(groupTypePosition.type, kept) : undefined
      )
    )
  await allowPosition(tx, positionId, kept)
}

async function applyPositionGroups(tx: OrgStructureTransaction, positionId: string, groupIds: string[]) {
  const [row] = await tx.select({ id: position.id }).from(position).where(eq(position.id, positionId)).for("update")
  if (!row) throw new RuleViolation("position-not-found")

  const kept = [...new Set(groupIds)]
  if (kept.length > 0) {
    const groups = await tx.select({ id: group.id, type: group.type }).from(group).where(inArray(group.id, kept))
    if (groups.length < kept.length) throw new RuleViolation("group-not-found")
    const allowed = await tx
      .select({ type: groupTypePosition.type })
      .from(groupTypePosition)
      .where(eq(groupTypePosition.positionId, positionId))
    if (!groups.every(({ type }) => allowed.some((allowedType) => allowedType.type === type))) {
      throw new RuleViolation("position-limit-type-not-allowed")
    }

    const [heldElsewhere] = await tx
      .select({ groupId: positionHolder.groupId })
      .from(positionHolder)
      .where(
        and(
          eq(positionHolder.positionId, positionId),
          isNull(positionHolder.endDate),
          notInArray(positionHolder.groupId, kept)
        )
      )
      .limit(1)
    if (heldElsewhere) throw new RuleViolation("position-held-outside-limit")
  }

  await tx
    .delete(positionGroup)
    .where(
      and(
        eq(positionGroup.positionId, positionId),
        kept.length > 0 ? notInArray(positionGroup.groupId, kept) : undefined
      )
    )
  if (kept.length > 0) {
    await tx
      .insert(positionGroup)
      .values(kept.map((groupId) => ({ positionId, groupId })))
      .onConflictDoNothing()
  }
}
