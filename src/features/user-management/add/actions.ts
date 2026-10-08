"use server"

import { revalidatePath } from "next/cache"
import { ROUTES } from "@/core/navigation/site"
import { inviteUser } from "../invite-user"
import { addUserSchema } from "./schemas"

export type AddUserState =
  | { status: "idle" }
  | {
      status: "error"
      kind: "name-required" | "email-required" | "email-invalid" | "email-exists" | "create-failed" | "unknown"
    }
  | { status: "success"; name: string; email: string; createdAt: number }
  | { status: "email-failed"; name: string; email: string; createdAt: number }

export async function addUser(_state: AddUserState, formData: FormData): Promise<AddUserState> {
  const input = addUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email")
  })

  if (!input.success) {
    const name = formData.get("name")
    const email = formData.get("email")
    const kind =
      typeof name !== "string" || !name.trim()
        ? "name-required"
        : typeof email !== "string" || !email.trim()
          ? "email-required"
          : "email-invalid"
    return { status: "error", kind }
  }

  const result = await inviteUser(input.data)
  if (result.kind === "already-exists") return { status: "error", kind: "email-exists" }
  if (result.kind === "creation-failed") return { status: "error", kind: "create-failed" }

  revalidatePath(ROUTES.adminUsers)
  if (result.kind === "email-failed") {
    return { status: "email-failed", name: input.data.name, email: input.data.email, createdAt: Date.now() }
  }
  return { status: "success", name: input.data.name, email: input.data.email, createdAt: Date.now() }
}
