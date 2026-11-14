"use server"

import { z } from "zod"
import { db } from "@/core/db"
import { archiveLocation, createLocation, updateLocation } from "../../locations"
import type { EventCommandState } from "../command-state"
import { SHORT_TEXT_MAX_LENGTH, URL_MAX_LENGTH } from "../limits"
import { runEventsCommand } from "../run-command"

// A blank name and an unsafe map link are the module's to refuse, so its violation names them.
const locationSchema = z.object({
  name: z.string().max(SHORT_TEXT_MAX_LENGTH),
  address: z.string().max(SHORT_TEXT_MAX_LENGTH).optional(),
  mapUrl: z.string().max(URL_MAX_LENGTH).optional()
})

function readLocation(formData: FormData) {
  const text = (name: string) => {
    const raw = formData.get(name)
    return typeof raw === "string" ? raw : undefined
  }
  return { name: text("name") ?? "", address: text("address"), mapUrl: text("mapUrl") }
}

export async function createLocationAction(_state: EventCommandState, formData: FormData) {
  const { state } = await runEventsCommand("create-location", locationSchema, readLocation(formData), (input) =>
    createLocation(db, input)
  )
  return state
}

const updateLocationSchema = z.object({ locationId: z.uuid(), location: locationSchema })

export async function updateLocationAction(_state: EventCommandState, formData: FormData) {
  const values = { locationId: formData.get("locationId"), location: readLocation(formData) }
  const { state } = await runEventsCommand("update-location", updateLocationSchema, values, (input) =>
    updateLocation(db, input.locationId, input.location)
  )
  return state
}

const archiveLocationSchema = z.object({ locationId: z.uuid() })

export async function archiveLocationAction(_state: EventCommandState, formData: FormData) {
  const values = { locationId: formData.get("locationId") }
  const { state } = await runEventsCommand("archive-location", archiveLocationSchema, values, (input) =>
    archiveLocation(db, input.locationId)
  )
  return state
}
