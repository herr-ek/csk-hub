"use client"

import { ChevronDownIcon, ChevronsUpDownIcon, ChevronUpIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { TableHead } from "@/shared/ui/base/table"
import { cn } from "@/shared/utils"

type SortState<Column extends string> = { column: Column; direction: "asc" | "desc" }

/**
 * Rows sorted by one column at a time. Sorting by the sorted column again reverses it. Rows a
 * column marks as `missing`, as a member with no Voice, stay last in either direction.
 */
export function useSortedRows<Row, Column extends string>(
  rows: Row[],
  comparators: Record<Column, (a: Row, b: Row) => number>,
  initial: NoInfer<Column>,
  missing: Partial<Record<NoInfer<Column>, (row: Row) => boolean>> = {}
) {
  const [sort, setSort] = useState<SortState<Column>>({ column: initial, direction: "asc" })
  const sorted = sortRows(rows, comparators[sort.column], sort.direction, missing[sort.column])
  const sortBy = (column: Column) =>
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    )
  return { sorted, sort, sortBy }
}

/** `rows` in `direction` by `compare`, with rows `isMissing` marks last either way. */
export function sortRows<Row>(
  rows: Row[],
  compare: (a: Row, b: Row) => number,
  direction: "asc" | "desc",
  isMissing?: (row: Row) => boolean
) {
  const sign = direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    if (isMissing && isMissing(a) !== isMissing(b)) return isMissing(a) ? 1 : -1
    return sign * compare(a, b)
  })
}

/** A column header that sorts the table by its column, announcing the order through `aria-sort`. */
export function SortableHead<Column extends string>({
  column,
  sort,
  onSort,
  children
}: {
  column: Column
  sort: SortState<Column>
  onSort: (column: Column) => void
  children: ReactNode
}) {
  const active = sort.column === column
  const Icon = !active ? ChevronsUpDownIcon : sort.direction === "asc" ? ChevronUpIcon : ChevronDownIcon
  return (
    <TableHead aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
        <Icon className={cn("size-3.5 shrink-0", !active && "opacity-50")} aria-hidden="true" />
      </button>
    </TableHead>
  )
}
