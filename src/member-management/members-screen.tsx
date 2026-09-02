import { Skeleton } from "@/shared/ui/base/skeleton"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { AddMemberDialog } from "./add/add-member-dialog"
import { ImportMembersDialog } from "./import/import-members-dialog"
import { MemberList } from "./member-list"
import { listMembers } from "./service"

export async function MembersScreen() {
  const members = await listMembers()

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">Members</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage everyone with access to CSK Hub.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AddMemberDialog />
            <ImportMembersDialog />
          </div>
        </div>
      </div>

      <MemberList members={members} />
    </main>
  )
}

export function MembersScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage everyone with access to CSK Hub.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="grid gap-1.5 sm:w-80">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="grid gap-1.5">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableCaption className="sr-only">Loading members</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-3xl" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  )
}
