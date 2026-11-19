"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
import { type ClientCommand, manageOidcClient } from "./clients.server"

export async function updateOidcClient(command: ClientCommand) {
  try {
    const credentials = await manageOidcClient(command)
    revalidatePath(ROUTES.adminOidcClients)
    return { success: true as const, credentials }
  } catch {
    return { success: false as const }
  }
}
