import "server-only"

import { eq } from "drizzle-orm"
import { forCurrentRequest } from "@/core/authz"
import { type Database, db } from "@/core/db"
import { event, eventTarget } from "@/core/db/schema/events"
import { GroupType } from "@/core/org-structure"
import { getGroupAuthorizationFacts, lockGroupAuthorizationFacts } from "@/features/org-structure"
import type { VoiceFamily } from "@/features/voice/model"
import type { EventType } from "./model"

type EventAccess = Awaited<ReturnType<typeof forCurrentRequest>>
type GroupFacts = Awaited<ReturnType<typeof getGroupAuthorizationFacts>>
type EventAction = "event.read" | "event.update" | "event.changeStatus" | "event.delete"

/** Resolve fresh identity and trusted organisational facts for one protected read operation. */
export async function getEventManagementScope(database: Parameters<typeof lockGroupAuthorizationFacts>[0]) {
  const access = await forCurrentRequest(database)
  const actor = access.requirePermission({ action: "app.access" })
  const initial = await getGroupAuthorizationFacts(database, actor.userId)
  const ids = managedEventGroupIds(access, initial)
  const facts = await lockGroupAuthorizationFacts(database, actor.userId, actor.isAdmin ? [] : ids)
  // A relationship gained while waiting for the User lock is picked up next time; never
  // grant a collection read for a Group whose archive lock this operation did not acquire.
  if (!actor.isAdmin) facts.groups = facts.groups.filter(({ id }) => ids.includes(id))
  return { access, facts }
}

export function eventGroupContext(facts: GroupFacts, groupId: string | null | undefined) {
  return {
    group: facts.groups.find(({ id }) => id === groupId) ?? null,
    groups: facts.groups,
    positionAppointments: facts.positionAppointments
  }
}

/** The Board groups the actor holds a Position in, whose archival would end the Board's authority. */
export function boardGroupIds(facts: GroupFacts) {
  const boards = new Set(facts.groups.filter(({ type }) => type === GroupType.Board).map(({ id }) => id))
  return facts.positionAppointments.flatMap(({ contextGroupId }) => (boards.has(contextGroupId) ? [contextGroupId] : []))
}

type TargetInput = { groupId: string | null; voiceFamily: string | null }

/** Targets as authorization facts, with each group's type taken from the trusted Group catalogue. */
export function targetFacts(facts: GroupFacts, targets: readonly TargetInput[]) {
  return targets.map(({ groupId, voiceFamily }) => ({
    groupId,
    groupType: facts.groups.find(({ id }) => id === groupId)?.type ?? null,
    voiceFamily: voiceFamily as VoiceFamily | null
  }))
}

/**
 * Authorize and execute in one transaction. Relationship locks precede Event locks; after
 * observing an Event, recheck its locked organiser so a concurrent reassignment cannot grant
 * access. A changed organiser fails closed; the caller can retry with current facts.
 * Supplying a proposed organiser checks both sides of an update, including removing one. An
 * update that proposes no type or Targets keeps the Event's own.
 */
export async function withEventPermission<T>(
  action: EventAction | "event.create",
  eventId: string | null,
  proposed: { organiserGroupId: string | null; type?: EventType; targets?: readonly TargetInput[] } | undefined,
  work: (database: Database, actorId: string) => Promise<T>,
  database: Database = db
): Promise<T> {
  return database.transaction(async (tx) => {
    const access = await forCurrentRequest(tx)
    const actor = access.requirePermission({ action: "app.access" })
    const [observed] = eventId
      ? await tx.select({ organiserGroupId: event.organiserGroupId }).from(event).where(eq(event.id, eventId))
      : []
    const organisers = [observed?.organiserGroupId, proposed?.organiserGroupId].filter((id): id is string =>
      Boolean(id)
    )
    // Board groups can grant access to an existing Event, so lock them with the organisers in one sorted batch.
    const initial = eventId ? await getGroupAuthorizationFacts(tx, actor.userId) : null
    const ids = [...organisers, ...(initial ? boardGroupIds(initial) : [])]
    const facts = await lockGroupAuthorizationFacts(tx, actor.userId, ids)
    const [resource] = eventId
      ? await tx
          .select()
          .from(event)
          .where(eq(event.id, eventId))
          .for(action === "event.read" ? "share" : "update")
      : []
    if (action === "event.create") {
      access.requirePermission({ action, context: eventGroupContext(facts, proposed?.organiserGroupId) })
    } else {
      // If reassigned during lock acquisition, force fresh facts rather than using an unlocked Group.
      const stable = resource && resource.organiserGroupId === observed?.organiserGroupId
      const stored = resource
        ? await tx
            .select({ groupId: eventTarget.groupId, voiceFamily: eventTarget.voiceFamily })
            .from(eventTarget)
            .where(eq(eventTarget.eventId, resource.id))
        : []
      const targets = targetFacts(facts, stored)
      const context = {
        ...eventGroupContext(facts, resource?.organiserGroupId),
        event: stable ? resource : null,
        targets
      }
      if (action === "event.update") {
        access.requirePermission({
          action,
          context: {
            ...context,
            proposedOrganiser: eventGroupContext(
              facts,
              proposed ? proposed.organiserGroupId : resource?.organiserGroupId
            ),
            // Without a stored Event the policy denies before reading this; "Other" only fills the shape.
            proposedEvent: {
              type: proposed?.type ?? resource?.type ?? "Other",
              targets: proposed?.targets ? targetFacts(facts, proposed.targets) : targets
            }
          }
        })
      } else {
        access.requirePermission({ action, context })
      }
    }
    return work(tx, actor.userId)
  })
}

/** IDs usable as an SQL collection predicate; no forbidden Event is loaded before filtering. */
export function managedEventGroupIds(access: EventAccess, facts: GroupFacts) {
  return facts.groups
    .filter((group) =>
      access.can({
        action: "event.create",
        context: { ...eventGroupContext(facts, group.id), group }
      })
    )
    .map(({ id }) => id)
}

/** Presentation hints only; command and read entrypoints establish authority independently. */
export async function getEventManagementCapabilities() {
  return db.transaction(async (tx) => {
    const { access, facts } = await getEventManagementScope(tx)
    return {
      canCreate: access.actor?.isAdmin === true || managedEventGroupIds(access, facts).length > 0,
      canAdminister: access.can({ action: "event.administer" })
    }
  })
}
