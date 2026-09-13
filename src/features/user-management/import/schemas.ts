import Papa from "papaparse"
import type { z } from "zod"
import { addUserSchema } from "../add/schemas"

export const MAX_IMPORT_USERS = 50
export const MAX_IMPORT_FILE_SIZE_BYTES = 1_000_000

export type ImportUserRow = z.infer<typeof addUserSchema> & { row: number }
export type ImportUserSkipped = { row: number; name: string; email: string; error: string }

export function validateImportUser(input: { name: string; email: string }) {
  const result = addUserSchema.safeParse(input)
  if (result.success) return { success: true as const, user: result.data }

  return {
    success: false as const,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    error: result.error.issues[0]?.message ?? "Please check the name and email."
  }
}

export function parseUserCsv(
  text: string
): { rows: ImportUserRow[]; skipped: ImportUserSkipped[] } | { error: string } {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" })
  if (parsed.errors.length > 0) return { error: "The CSV could not be parsed. Please check its quoted values." }

  const [header, ...dataRows] = parsed.data
  if (!header) {
    return { error: "The CSV is empty." }
  }

  const normalizedHeader = header.map((value) => value.trim().toLowerCase())
  const nameIndex = normalizedHeader.indexOf("name")
  const emailIndex = normalizedHeader.indexOf("email")
  if (nameIndex === -1 || emailIndex === -1) {
    return { error: "The CSV must include name and email columns." }
  }

  if (dataRows.length === 0) {
    return { error: "The CSV does not contain any users." }
  }
  if (dataRows.length > MAX_IMPORT_USERS) {
    return { error: `You can import up to ${MAX_IMPORT_USERS} users at a time.` }
  }

  const emails = new Set<string>()
  const rows: ImportUserRow[] = []
  const skipped: ImportUserSkipped[] = []
  for (const [index, values] of dataRows.entries()) {
    const rowNumber = index + 2
    const result = validateImportUser({ name: values[nameIndex] ?? "", email: values[emailIndex] ?? "" })
    if (!result.success) {
      skipped.push({
        row: rowNumber,
        name: result.name,
        email: result.email,
        error: result.error
      })
      continue
    }
    if (emails.has(result.user.email)) {
      skipped.push({
        row: rowNumber,
        name: result.user.name,
        email: result.user.email,
        error: "The email address is repeated in this CSV."
      })
      continue
    }
    emails.add(result.user.email)
    rows.push({ ...result.user, row: rowNumber })
  }

  return { rows, skipped }
}
