"use client"

import { useRef, useState, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
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
import { findExistingUserEmails, type ImportUsersState, importUsers } from "./actions"
import { type ImportUserRow, MAX_IMPORT_FILE_SIZE_BYTES, parseUserCsv, validateImportUser } from "./schemas"

const initialState: ImportUsersState = { status: "idle" }
type PreviewRow = ImportUserRow & { discarded: boolean; error?: string }

export function ImportUsersDialog() {
  const t = useTranslations("Members")
  const common = useTranslations("Common")
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ImportUsersState>(initialState)
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [parseError, setParseError] = useState<string>()
  const [fileName, setFileName] = useState("")
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function validateRows(rows: PreviewRow[], existingEmails: Set<string>): PreviewRow[] {
    const emails = new Set<string>()
    return rows.map((row) => {
      if (row.discarded) return { ...row, error: undefined }
      const result = validateImportUser(row)
      if (!result.success) return { ...row, name: result.name, email: result.email, error: result.error }
      if (existingEmails.has(result.user.email)) return { ...row, ...result.user, error: t("emailExists") }
      if (emails.has(result.user.email)) return { ...row, ...result.user, error: t("emailRepeated") }
      emails.add(result.user.email)
      return { ...row, ...result.user, error: undefined }
    })
  }

  async function chooseFile(file: File | undefined) {
    setState(initialState)
    setRows(null)
    setParseError(undefined)
    setFileName(file?.name ?? "")
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".csv")) return setParseError(t("csvExtensionRequired"))
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) return setParseError(t("csvTooLarge"))
    const parsed = parseUserCsv(await file.text())
    if ("error" in parsed) return setParseError(parsed.error)
    const sourceRows = [...parsed.rows, ...parsed.skipped].sort((left, right) => left.row - right.row)
    const existing = new Set(await findExistingUserEmails(sourceRows.map((row) => row.email)))
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
      void findExistingUserEmails([change.email])
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
    startTransition(() => void importUsers(initialState, formData).then(setState))
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
            {t("importUsers")}
          </Button>
        }
      />
      <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("importUsers")}</DialogTitle>
          <DialogDescription>{t("importDescription")}</DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={submit} className="space-y-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="user-csv">{t("csvFile")}</FieldLabel>
              <Input
                id="user-csv"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
              <FieldDescription>{fileName || t("csvColumns")}</FieldDescription>
            </Field>
            <FieldError>{error}</FieldError>
          </FieldGroup>
          {rows ? <input type="hidden" name="users" value={JSON.stringify(readyRows)} /> : null}
          {rows ? (
            <div className="space-y-3 text-sm">
              <div>
                {state.status === "success" ? (
                  <>
                    <p className="font-medium">{t("importReport")}</p>
                    <p className="text-muted-foreground">
                      {t("importSummary", {
                        sent: state.created.length,
                        emailFailed: state.emailFailed.length,
                        failed: state.failed.length
                      })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">{t("invitesReady", { count: readyRows.length })}</p>
                    <p className="text-muted-foreground">{t("editRows")}</p>
                  </>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("row")}</TableHead>
                      <TableHead>{common("name")}</TableHead>
                      <TableHead>{common("email")}</TableHead>
                      <TableHead>{common("status")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((user) => {
                      const result =
                        state.status === "success"
                          ? state.created.some((item) => item.row === user.row)
                            ? { label: t("sent"), className: "text-green-700 dark:text-green-400" }
                            : state.emailFailed.some((item) => item.row === user.row)
                              ? {
                                  label: t("createdInviteNotSent"),
                                  className: "text-yellow-600 dark:text-yellow-400"
                                }
                              : state.failed.find((item) => item.row === user.row)
                                ? {
                                    label: state.failed.find((item) => item.row === user.row)?.error ?? t("failed"),
                                    className: "text-destructive"
                                  }
                                : null
                          : null

                      return (
                        <TableRow key={user.row} className={user.discarded ? "opacity-50" : undefined}>
                          <TableCell>{user.row}</TableCell>
                          <TableCell>
                            <Input
                              value={user.name}
                              disabled={user.discarded || state.status === "success"}
                              onChange={(event) => updateRow(user.row, { name: event.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={user.email}
                              disabled={user.discarded || state.status === "success"}
                              onChange={(event) => updateRow(user.row, { email: event.target.value })}
                            />
                          </TableCell>
                          <TableCell
                            className={
                              result
                                ? result.className
                                : user.error
                                  ? "text-destructive"
                                  : user.discarded
                                    ? "text-muted-foreground"
                                    : "text-green-700 dark:text-green-400"
                            }
                          >
                            {user.discarded ? t("discarded") : (result?.label ?? user.error ?? t("ready"))}
                          </TableCell>
                          <TableCell className="text-right">
                            {state.status !== "success" ? (
                              <Button
                                type="button"
                                size="xs"
                                variant={user.discarded ? "outline" : "ghost"}
                                onClick={() => updateRow(user.row, { discarded: !user.discarded })}
                              >
                                {user.discarded ? t("restore") : t("discard")}
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
              {common("close")}
            </Button>
          ) : (
            <Button type="submit" disabled={!canConfirm}>
              {pending ? (
                <>
                  <Spinner /> {t("sendingInvites")}
                </>
              ) : (
                t("confirmAndSendInvites")
              )}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
