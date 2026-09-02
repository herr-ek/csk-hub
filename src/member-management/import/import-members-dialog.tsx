"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/shared/ui/base/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/shared/ui/base/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Spinner } from "@/shared/ui/base/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { findExistingMemberEmails, type ImportMembersState, importMembers } from "./actions"
import { type ImportMemberRow, MAX_IMPORT_FILE_SIZE_BYTES, parseMemberCsv, validateImportMember } from "./schemas"

const initialState: ImportMembersState = { status: "idle" }
type PreviewRow = ImportMemberRow & { discarded: boolean; error?: string }

function validateRows(rows: PreviewRow[], existingEmails: Set<string>): PreviewRow[] {
  const emails = new Set<string>()
  return rows.map((row) => {
    if (row.discarded) return { ...row, error: undefined }
    const result = validateImportMember(row)
    if (!result.success) return { ...row, name: result.name, email: result.email, error: result.error }
    if (existingEmails.has(result.member.email))
      return { ...row, ...result.member, error: "A member with that email already exists." }
    if (emails.has(result.member.email))
      return { ...row, ...result.member, error: "The email address is repeated in this CSV." }
    emails.add(result.member.email)
    return { ...row, ...result.member, error: undefined }
  })
}

export function ImportMembersDialog() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ImportMembersState>(initialState)
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [parseError, setParseError] = useState<string>()
  const [fileName, setFileName] = useState("")
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  async function chooseFile(file: File | undefined) {
    setState(initialState)
    setRows(null)
    setParseError(undefined)
    setFileName(file?.name ?? "")
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".csv")) return setParseError("Please choose a file with a .csv extension.")
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) return setParseError("The CSV must be 1 MB or smaller.")
    const parsed = parseMemberCsv(await file.text())
    if ("error" in parsed) return setParseError(parsed.error)
    const sourceRows = [...parsed.rows, ...parsed.skipped].sort((left, right) => left.row - right.row)
    const existing = new Set(await findExistingMemberEmails(sourceRows.map((row) => row.email)))
    setExistingEmails(existing)
    setRows(
      validateRows(
        sourceRows.map((row) => ({ ...row, discarded: false })),
        existing
      )
    )
  }

  function updateRow(rowNumber: number, change: Partial<Pick<PreviewRow, "name" | "email" | "discarded">>) {
    setRows(
      (current) =>
        current &&
        validateRows(
          current.map((row) => (row.row === rowNumber ? { ...row, ...change } : row)),
          existingEmails
        )
    )
    if (change.email) {
      void findExistingMemberEmails([change.email])
        .then((matches) => {
          if (matches.length === 0) return
          setExistingEmails((current) => {
            const next = new Set([...current, ...matches])
            setRows((currentRows) => currentRows && validateRows(currentRows, next))
            return next
          })
        })
        .catch(() => undefined)
    }
  }

  function submit(formData: FormData) {
    startTransition(() => void importMembers(initialState, formData).then(setState))
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) return setState(initialState)
    formRef.current?.reset()
    setFileName("")
    setRows(null)
    setParseError(undefined)
    setExistingEmails(new Set())
  }

  const error = state.status === "error" ? state.error : parseError
  const readyRows = rows?.filter((row) => !row.discarded && !row.error) ?? []
  const canConfirm = readyRows.length > 0 && !pending && state.status !== "success"

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            Import users
          </Button>
        }
      />
      <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import users</DialogTitle>
          <DialogDescription>
            Upload a CSV with name and email columns, then review each row before inviting.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={submit} className="space-y-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="member-csv">CSV file</FieldLabel>
              <Input
                id="member-csv"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
              <FieldDescription>
                {fileName || "Required columns: name, email. Other columns are ignored."}
              </FieldDescription>
            </Field>
            <FieldError>{error}</FieldError>
          </FieldGroup>
          {rows ? <input type="hidden" name="members" value={JSON.stringify(readyRows)} /> : null}
          {rows ? (
            <div className="space-y-3 text-sm">
              <div>
                {state.status === "success" ? (
                  <>
                    <p className="font-medium">Import report</p>
                    <p className="text-muted-foreground">
                      {state.created.length} sent, {state.emailFailed.length} created but not sent,{" "}
                      {state.failed.length} failed.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">{readyRows.length} invite(s) ready to send</p>
                    <p className="text-muted-foreground">
                      Edit rows to fix problems, or discard any row before confirming.
                    </p>
                  </>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((member) => {
                      const result =
                        state.status === "success"
                          ? state.created.some((item) => item.row === member.row)
                            ? { label: "Sent", className: "text-green-700 dark:text-green-400" }
                            : state.emailFailed.some((item) => item.row === member.row)
                              ? {
                                  label: "Created — invite not sent",
                                  className: "text-yellow-600 dark:text-yellow-400"
                                }
                              : state.failed.find((item) => item.row === member.row)
                                ? {
                                    label: state.failed.find((item) => item.row === member.row)?.error ?? "Failed",
                                    className: "text-destructive"
                                  }
                                : null
                          : null

                      return (
                        <TableRow key={member.row} className={member.discarded ? "opacity-50" : undefined}>
                          <TableCell>{member.row}</TableCell>
                          <TableCell>
                            <Input
                              value={member.name}
                              disabled={member.discarded || state.status === "success"}
                              onChange={(event) => updateRow(member.row, { name: event.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={member.email}
                              disabled={member.discarded || state.status === "success"}
                              onChange={(event) => updateRow(member.row, { email: event.target.value })}
                            />
                          </TableCell>
                          <TableCell
                            className={
                              result
                                ? result.className
                                : member.error
                                  ? "text-destructive"
                                  : member.discarded
                                    ? "text-muted-foreground"
                                    : "text-green-700 dark:text-green-400"
                            }
                          >
                            {member.discarded ? "Discarded" : (result?.label ?? member.error ?? "Ready")}
                          </TableCell>
                          <TableCell className="text-right">
                            {state.status !== "success" ? (
                              <Button
                                type="button"
                                size="xs"
                                variant={member.discarded ? "outline" : "ghost"}
                                onClick={() => updateRow(member.row, { discarded: !member.discarded })}
                              >
                                {member.discarded ? "Restore" : "Discard"}
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          {state.status === "success" ? (
            <Button type="button" onClick={() => changeOpen(false)}>
              Close
            </Button>
          ) : (
            <Button type="submit" disabled={!canConfirm}>
              {pending ? (
                <>
                  <Spinner /> Sending invites
                </>
              ) : (
                "Confirm and send invites"
              )}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
