"use server"

import { inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireAdmin } from "@/core/auth/permissions.server"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { ROUTES } from "@/core/navigation/site"
import { inviteUsers } from "../invite-user"
import {
  type ImportCsvError,
  type ImportUserRow,
  type ImportUserSkipped,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_USERS,
  parseUserCsv
} from "./schemas"

const importRowsSchema = z
  .array(
    z.object({ row: z.number().int().positive(), name: z.string().trim().min(1), email: z.string().trim().email() })
  )
  .min(1)
  .max(MAX_IMPORT_USERS)

export async function findExistingUserEmails(emails: string[]): Promise<string[]> {
  await requireAdmin()
  const normalizedEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))]
  if (normalizedEmails.length === 0) return []

  const users = await db.select({ email: user.email }).from(user).where(inArray(user.email, normalizedEmails))
  return users.map((user) => user.email.toLowerCase())
}

export type ImportUsersState =
  | { status: "idle" }
  | {
      status: "error"
      error:
        | { kind: "invalid-preview" }
        | { kind: "file-required" }
        | { kind: "file-extension" }
        | { kind: "file-too-large" }
        | { kind: "csv-parse"; code: ImportCsvError }
        | { kind: "no-valid-rows" }
    }
  | {
      status: "success"
      created: Array<{ row: number; name: string; email: string }>
      emailFailed: Array<{ row: number; name: string; email: string }>
      failed: Array<{ row: number; error: "email-exists" | "create-failed" }>
      skipped: ImportUserSkipped[]
    }

export async function importUsers(_state: ImportUsersState, formData: FormData): Promise<ImportUsersState> {
  await requireAdmin()
  const submittedRows = formData.get("users")
  let rows: ImportUserRow[]
  let skipped: ImportUserSkipped[]
  if (typeof submittedRows === "string") {
    try {
      rows = importRowsSchema.parse(JSON.parse(submittedRows))
      skipped = []
    } catch {
      return { status: "error", error: { kind: "invalid-preview" } }
    }
  } else {
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", error: { kind: "file-required" } }
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return { status: "error", error: { kind: "file-extension" } }
    }
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      return { status: "error", error: { kind: "file-too-large" } }
    }

    const parsed = parseUserCsv(await file.text())
    if ("error" in parsed) {
      return { status: "error", error: { kind: "csv-parse", code: parsed.error } }
    }
    rows = parsed.rows
    skipped = parsed.skipped
  }
  if (rows.length === 0) return { status: "error", error: { kind: "no-valid-rows" } }

  const failed: Array<{ row: number; error: "email-exists" | "create-failed" }> = []
  const created: Array<{ row: number; name: string; email: string }> = []
  const emailFailed: Array<{ row: number; name: string; email: string }> = []
  const results = await inviteUsers(rows)
  for (const [index, result] of results.entries()) {
    const user = rows[index]
    if (result.kind === "sent") created.push({ row: user.row, name: user.name, email: user.email })
    else if (result.kind === "email-failed") emailFailed.push({ row: user.row, name: user.name, email: user.email })
    else
      failed.push({
        row: user.row,
        error: result.kind === "already-exists" ? "email-exists" : "create-failed"
      })
  }

  revalidatePath(ROUTES.adminUsers)
  return { status: "success", created, emailFailed, failed, skipped }
}
