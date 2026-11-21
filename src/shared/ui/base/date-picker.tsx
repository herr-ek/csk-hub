"use client"

import { CalendarIcon } from "lucide-react"
import { useId, useState } from "react"
import { de, enGB, sv } from "react-day-picker/locale"
import { Button } from "@/shared/ui/base/button"
import { Calendar } from "@/shared/ui/base/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/base/popover"
import { useUiLabels, useUiLocale } from "@/shared/ui/UiLabelsProvider"
import { cn } from "@/shared/utils"

// Calendar month and weekday names; every one of these starts the week on Monday.
const CALENDAR_LOCALES: Record<string, typeof enGB> = { en: enGB, sv, de }

const pad = (value: number) => String(value).padStart(2, "0")

function toLocalDate(value: string | undefined) {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

type DatePickerProps = {
  id?: string
  /** `YYYY-MM-DD`, or `""` for none. */
  value: string
  onValueChange: (value: string) => void
  "aria-labelledby"?: string
  invalid?: boolean
  /** Offers Clear, which reports `""`. */
  clearable?: boolean
  /** The first day that can be picked. */
  min?: string
  /** The month shown while there is no value; otherwise `min`'s month, or this month. */
  defaultMonth?: string
  className?: string
}

/**
 * A button showing the date, which opens a calendar in the app's locale. The same in every
 * browser, unlike `<input type="date">`. It does not submit anything by itself.
 */
export function DatePicker({
  id,
  value,
  onValueChange,
  "aria-labelledby": labelledBy,
  invalid,
  clearable,
  min,
  defaultMonth,
  className
}: DatePickerProps) {
  const labels = useUiLabels()
  const locale = useUiLocale()
  const valueId = useId()
  const [open, setOpen] = useState(false)
  const selected = toLocalDate(value)
  const shown = value
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(new Date(`${value}T00:00Z`))
    : labels.pickDate

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined}
        aria-invalid={invalid}
        className={cn(
          "flex h-9 min-w-0 cursor-pointer items-center gap-2 rounded-3xl border border-transparent bg-input/50 px-3 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
      >
        <CalendarIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span id={valueId} className={cn("truncate", !value && "text-muted-foreground")}>
          {shown}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-0">
        <Calendar
          mode="single"
          locale={CALENDAR_LOCALES[locale] ?? enGB}
          selected={selected}
          defaultMonth={selected ?? toLocalDate(defaultMonth) ?? toLocalDate(min)}
          disabled={min ? { before: toLocalDate(min) as Date } : undefined}
          onSelect={(day) => {
            if (!day) return
            onValueChange(toIsoDate(day))
            setOpen(false)
          }}
        />
        {clearable && value ? (
          <div className="flex justify-end px-3 pb-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onValueChange("")
                setOpen(false)
              }}
            >
              {labels.clearDate}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
