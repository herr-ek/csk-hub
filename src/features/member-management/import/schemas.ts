import Papa from "papaparse"
import type { z } from "zod"
import { addMemberSchema } from "../add/schemas"

export const MAX_IMPORT_MEMBERS = 50
export const MAX_IMPORT_FILE_SIZE_BYTES = 1_000_000

export type ImportMemberRow = z.infer<typeof addMemberSchema> & { row: number }
export type ImportMemberSkipped = { row: number; name: string; email: string; error: string }

export function validateImportMember(input: { name: string; email: string }) {
  const result = addMemberSchema.safeParse(input)
  if (result.success) return { success: true as const, member: result.data }

  return {
    success: false as const,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    error: result.error.issues[0]?.message ?? "Please check the name and email."
  }
}

export function parseMemberCsv(
  text: string
): { rows: ImportMemberRow[]; skipped: ImportMemberSkipped[] } | { error: string } {
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
  if (dataRows.length > MAX_IMPORT_MEMBERS) {
    return { error: `You can import up to ${MAX_IMPORT_MEMBERS} users at a time.` }
  }

  const emails = new Set<string>()
  const rows: ImportMemberRow[] = []
  const skipped: ImportMemberSkipped[] = []
  for (const [index, values] of dataRows.entries()) {
    const rowNumber = index + 2
    const result = validateImportMember({ name: values[nameIndex] ?? "", email: values[emailIndex] ?? "" })
    if (!result.success) {
      skipped.push({
        row: rowNumber,
        name: result.name,
        email: result.email,
        error: result.error
      })
      continue
    }
    if (emails.has(result.member.email)) {
      skipped.push({
        row: rowNumber,
        name: result.member.name,
        email: result.member.email,
        error: "The email address is repeated in this CSV."
      })
      continue
    }
    emails.add(result.member.email)
    rows.push({ ...result.member, row: rowNumber })
  }

  return { rows, skipped }
}
