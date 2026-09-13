"use client"

import { CheckIcon, TriangleAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { app } from "@/core/config/app"
import { useFormatter, useTranslations } from "@/core/i18n/translations"
import { parseRoles, USER_ROLE } from "@/shared/roles"
import { Badge } from "@/shared/ui/base/badge"
import { Input } from "@/shared/ui/base/input"
import { NativeSelect, NativeSelectOption } from "@/shared/ui/base/native-select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import type { UserListItem } from "./service"
import { UserActions } from "./user-actions"

type UserStatusFilter = "active" | "inactive" | "all"

function roleLabel(role: UserListItem["role"]) {
  return parseRoles(role)
    .filter((value) => value !== USER_ROLE)
    .map((value) => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`)
    .join(", ")
}

export function UserList({ users }: { users: UserListItem[] }) {
  const t = useTranslations("Members")
  const common = useTranslations("Common")
  const format = useFormatter()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<UserStatusFilter>("active")
  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return users.filter((user) => {
      if (status === "active" && user.inactive) return false
      if (status === "inactive" && !user.inactive) return false
      return !normalizedQuery || `${user.name} ${user.email}`.toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [users, query, status])

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium sm:w-80">
          {t("search")}
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          {t("status")}
          <NativeSelect value={status} onChange={(event) => setStatus(event.target.value as UserStatusFilter)}>
            <NativeSelectOption value="active">{t("active")}</NativeSelectOption>
            <NativeSelectOption value="inactive">{t("inactive")}</NativeSelectOption>
            <NativeSelectOption value="all">{t("all")}</NativeSelectOption>
          </NativeSelect>
        </label>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableCaption className="sr-only">{t("description", { appName: app.name })}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{common("name")}</TableHead>
              <TableHead>{common("email")}</TableHead>
              <TableHead>{t("roles")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("joined")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{t("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleUsers.length > 0 ? (
              visibleUsers.map((user) => {
                const hasPassword = Boolean(user.hasPassword)

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">{user.name}</div>
                      {user.username ? (
                        <div className="text-sm text-muted-foreground">
                          {t("usernameHandle", { username: user.username })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{user.email}</span>
                        {user.emailVerified ? (
                          <CheckIcon
                            className="size-4 text-green-600 dark:text-green-400"
                            aria-label={t("emailVerified")}
                          />
                        ) : (
                          <TriangleAlertIcon
                            className="size-4 text-yellow-600 dark:text-yellow-400"
                            aria-label={t("emailNotVerified")}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{roleLabel(user.role) || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={user.inactive ? "secondary" : hasPassword ? "default" : "outline"}>
                        {user.inactive ? t("inactiveStatus") : hasPassword ? t("activeStatus") : t("pending")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format.dateTime(user.createdAt, { year: "numeric", month: "2-digit", day: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActions
                        userId={user.id}
                        userName={user.name}
                        inactive={user.inactive ?? false}
                        hasPassword={hasPassword}
                        role={user.role ?? USER_ROLE}
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t("noMatches")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
