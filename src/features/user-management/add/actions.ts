"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
import { inviteUser } from "../invite-user"
import { addUserSchema } from "./schemas"

export type AddUserState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; name: string; email: string; createdAt: number }
  | { status: "email-failed"; name: string; email: string; createdAt: number }

export async function addUser(_state: AddUserState, formData: FormData): Promise<AddUserState> {
  const input = addUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email")
  })

  if (!input.success) {
    return { status: "error", error: input.error.issues[0]?.message ?? "Please check the form and try again." }
  }

  const result = await inviteUser(input.data)
  if (result.kind === "already-exists") return { status: "error", error: "A user with that email already exists." }
  if (result.kind === "creation-failed")
    return { status: "error", error: "Unable to create the user right now. Please try again." }

  revalidatePath(ROUTES.adminUsers)
  if (result.kind === "email-failed") {
    return { status: "email-failed", name: input.data.name, email: input.data.email, createdAt: Date.now() }
  }
  return { status: "success", name: input.data.name, email: input.data.email, createdAt: Date.now() }
}
