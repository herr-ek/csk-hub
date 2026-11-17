import "server-only"

import { eq } from "drizzle-orm"
import { forCurrentRequest } from "@/core/authz"
import { type Database, db } from "@/core/db"
import { event } from "@/core/db/schema/events"
import { getGroupAuthorizationFacts, lockGroupAuthorizationFacts } from "@/features/org-structure"

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
    positionAppointments: facts.positionAppointments
  }
}

/**
 * Authorize and execute in one transaction. Relationship locks precede Event locks; after
 * observing an Event, recheck its locked organiser so a concurrent reassignment cannot grant
 * access. A changed organiser fails closed; the caller can retry with current facts.
 * Supplying a proposed organiser checks both sides of an update, including removing one.
 */
export async function withEventPermission<T>(
  action: EventAction | "event.create",
  eventId: string | null,
  proposed: { organiserGroupId: string | null } | undefined,
  work: (database: Database, actorId: string) => Promise<T>,
  database: Database = db
): Promise<T> {
  return database.transaction(async (tx) => {
    const access = await forCurrentRequest(tx)
    const actor = access.requirePermission({ action: "app.access" })
    const [observed] = eventId
      ? await tx.select({ organiserGroupId: event.organiserGroupId }).from(event).where(eq(event.id, eventId))
      : []
    const ids = [observed?.organiserGroupId, proposed?.organiserGroupId].filter((id): id is string => Boolean(id))
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
      const context = { ...eventGroupContext(facts, resource?.organiserGroupId), event: stable ? resource : null }
      if (action === "event.update") {
        access.requirePermission({
          action,
          context: {
            ...context,
            proposedOrganiser: eventGroupContext(
              facts,
              proposed ? proposed.organiserGroupId : resource?.organiserGroupId
            )
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
