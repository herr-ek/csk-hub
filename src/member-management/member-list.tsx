"use client"

import { CheckIcon, TriangleAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { MEMBER_ROLE, parseRoles } from "@/shared/roles"
import { Badge } from "@/shared/ui/base/badge"
import { Input } from "@/shared/ui/base/input"
import { NativeSelect, NativeSelectOption } from "@/shared/ui/base/native-select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { MemberActions } from "./member-actions"
import type { MemberListItem } from "./service"

type MemberStatusFilter = "active" | "inactive" | "all"

function roleLabel(role: MemberListItem["role"]) {
  return parseRoles(role)
    .filter((value) => value !== MEMBER_ROLE)
    .map((value) => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`)
    .join(", ")
}

export function MemberList({ members }: { members: MemberListItem[] }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<MemberStatusFilter>("active")
  const visibleMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return members.filter((member) => {
      if (status === "active" && member.inactive) return false
      if (status === "inactive" && !member.inactive) return false
      return !normalizedQuery || `${member.name} ${member.email}`.toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [members, query, status])

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium sm:w-80">
          Search members
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Status
          <NativeSelect value={status} onChange={(event) => setStatus(event.target.value as MemberStatusFilter)}>
            <NativeSelectOption value="active">Active members</NativeSelectOption>
            <NativeSelectOption value="inactive">Inactive members</NativeSelectOption>
            <NativeSelectOption value="all">All members</NativeSelectOption>
          </NativeSelect>
        </label>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableCaption className="sr-only">Members with access to CSK Hub</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleMembers.length > 0 ? (
              visibleMembers.map((member) => {
                const hasPassword = Boolean(member.hasPassword)

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium">{member.name}</div>
                      {member.username ? <div className="text-sm text-muted-foreground">@{member.username}</div> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{member.email}</span>
                        {member.emailVerified ? (
                          <CheckIcon
                            className="size-4 text-green-600 dark:text-green-400"
                            aria-label="Email verified"
                          />
                        ) : (
                          <TriangleAlertIcon
                            className="size-4 text-yellow-600 dark:text-yellow-400"
                            aria-label="Email not verified"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{roleLabel(member.role) || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={member.inactive ? "secondary" : hasPassword ? "default" : "outline"}>
                        {member.inactive ? "Inactive" : hasPassword ? "Active" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>{member.createdAt.toLocaleDateString("en-GB")}</TableCell>
                    <TableCell className="text-right">
                      <MemberActions
                        userId={member.id}
                        memberName={member.name}
                        inactive={member.inactive ?? false}
                        hasPassword={hasPassword}
                        role={member.role ?? MEMBER_ROLE}
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No members match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
