import "server-only"

import { eq } from "drizzle-orm"
import { location } from "@/core/db/schema/events"
import {
  type EventsDatabase,
  type EventsTransaction,
  RuleViolation,
  runEventCommand,
  optionalText as text
} from "./operation"

/** A Location's fields. The address and map link are optional; blank is absent. */
export type LocationInput = { name: string; address?: string | null; mapUrl?: string | null }

/** Creates an active Location. Names are unique among active Locations. */
export function createLocation(database: EventsDatabase, input: LocationInput) {
  return runEventCommand(database, async (tx) => {
    const [created] = await tx.insert(location).values(locationValues(input)).returning({ id: location.id })
    if (!created) throw new Error("Location creation did not return a record.")
    return created
  })
}

/** Changes an active Location. Events that use it show the change. */
export function updateLocation(database: EventsDatabase, locationId: string, input: LocationInput) {
  return runEventCommand(database, async (tx) => {
    await requireActiveLocation(tx, locationId)
    await tx.update(location).set(locationValues(input)).where(eq(location.id, locationId))
  })
}

/**
 * Archives a Location; Locations are never deleted. Events that use it keep it, but it is no
 * longer offered for new ones.
 */
export function archiveLocation(database: EventsDatabase, locationId: string) {
  return runEventCommand(database, async (tx) => {
    await requireActiveLocation(tx, locationId)
    await tx.update(location).set({ active: false }).where(eq(location.id, locationId))
  })
}

async function requireActiveLocation(tx: EventsTransaction, locationId: string) {
  const [row] = await tx
    .select({ active: location.active })
    .from(location)
    .where(eq(location.id, locationId))
    .for("update")
  if (!row) throw new RuleViolation("location-not-found")
  if (!row.active) throw new RuleViolation("location-archived")
}

function locationValues(input: LocationInput) {
  const mapUrl = text(input.mapUrl)
  if (mapUrl && !isWebAddress(mapUrl)) throw new RuleViolation("invalid-map-url")
  return { name: input.name.trim(), address: text(input.address), mapUrl }
}

/** The map link is shown as a link, so only a web address will do. */
function isWebAddress(value: string) {
  try {
    const { protocol } = new URL(value)
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}
