"use server"

import { inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireAdmin } from "@/core/auth/permissions.server"
import { db } from "@/core/db"
import { user } from "@/core/db/schema/auth"
import { ROUTES } from "@/core/navigation/site"
import { inviteMembers } from "../invite-member"
import {
  type ImportMemberRow,
  type ImportMemberSkipped,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_MEMBERS,
  parseMemberCsv
} from "./schemas"

const importRowsSchema = z
  .array(
    z.object({ row: z.number().int().positive(), name: z.string().trim().min(1), email: z.string().trim().email() })
  )
  .min(1)
  .max(MAX_IMPORT_MEMBERS)

export async function findExistingMemberEmails(emails: string[]): Promise<string[]> {
  await requireAdmin()
  const normalizedEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))]
  if (normalizedEmails.length === 0) return []

  const members = await db.select({ email: user.email }).from(user).where(inArray(user.email, normalizedEmails))
  return members.map((member) => member.email.toLowerCase())
}

export type ImportMembersState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "success"
      created: Array<{ row: number; name: string; email: string }>
      emailFailed: Array<{ row: number; name: string; email: string }>
      failed: Array<{ row: number; error: string }>
      skipped: ImportMemberSkipped[]
    }

export async function importMembers(_state: ImportMembersState, formData: FormData): Promise<ImportMembersState> {
  await requireAdmin()
  const submittedRows = formData.get("members")
  let rows: ImportMemberRow[]
  let skipped: ImportMemberSkipped[]
  if (typeof submittedRows === "string") {
    try {
      rows = importRowsSchema.parse(JSON.parse(submittedRows))
      skipped = []
    } catch {
      return { status: "error", error: "The import preview is invalid. Please upload the CSV again." }
    }
  } else {
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", error: "Please choose a CSV file." }
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return { status: "error", error: "Please choose a file with a .csv extension." }
    }
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      return { status: "error", error: "The CSV must be 1 MB or smaller." }
    }

    const parsed = parseMemberCsv(await file.text())
    if ("error" in parsed) {
      return { status: "error", error: parsed.error }
    }
    rows = parsed.rows
    skipped = parsed.skipped
  }
  if (rows.length === 0) return { status: "error", error: "Keep at least one valid row to import." }

  const failed: Array<{ row: number; error: string }> = []
  const created: Array<{ row: number; name: string; email: string }> = []
  const emailFailed: Array<{ row: number; name: string; email: string }> = []
  const results = await inviteMembers(rows)
  for (const [index, result] of results.entries()) {
    const member = rows[index]
    if (result.kind === "sent") created.push({ row: member.row, name: member.name, email: member.email })
    else if (result.kind === "email-failed")
      emailFailed.push({ row: member.row, name: member.name, email: member.email })
    else
      failed.push({
        row: member.row,
        error:
          result.kind === "already-exists"
            ? "A member with that email already exists."
            : "Unable to create this member."
      })
  }

  revalidatePath(ROUTES.adminMembers)
  return { status: "success", created, emailFailed, failed, skipped }
}
