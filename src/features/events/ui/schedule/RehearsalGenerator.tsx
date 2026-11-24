"use client"

import { Plus } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { useId, useState, useTransition } from "react"
import { useFormatter, useTranslations } from "@/core/i18n/translations"
import { DateField, InputField, SelectField } from "@/shared/forms/fields"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Checkbox } from "@/shared/ui/base/checkbox"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { TimeInput } from "@/shared/ui/base/time-input"
import { toast } from "@/shared/ui/base/toast"
import { type IsoDate, WEEKDAYS, type Weekday } from "../../model"
import type { EventCommandError } from "../command-state"
import { useEventErrorMessage } from "../errors"
import { createRehearsalSeriesAction, type PreviewDate, previewRehearsalSeriesAction } from "./actions"

type Choice = { id: string; name: string }

/** A date as a wall-clock-free instant: noon UTC is the same calendar day in Stockholm. */
function noon(date: IsoDate) {
  return new Date(`${date}T12:00:00Z`)
}

type GeneratorProps = {
  choirs: Choice[]
  locations: (Choice & { active: boolean })[]
  today: IsoDate
}

const spring = { type: "spring", bounce: 0.2, duration: 0.45 } as const
// No bounce on height: an overshoot past 0 springs back open a few pixels before the form is removed.
const unfold = { type: "spring", bounce: 0, duration: 0.4 } as const

// The preview's dates fall into place one after another.
const dateList = { shown: { transition: { staggerChildren: 0.03 } } } as const
const dateItem = {
  hidden: { opacity: 0, y: 8, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1, transition: spring }
} as const

/** A button that unfolds the Series form, folded again once a Series is created. */
export function RehearsalGenerator(props: GeneratorProps) {
  const t = useTranslations("Events.schedule.generator")
  const ui = useTranslations("Ui")
  const [open, setOpen] = useState(false)
  const formId = useId()

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col">
        <div>
          <Button
            type="button"
            variant={open ? "outline" : "default"}
            aria-expanded={open}
            aria-controls={formId}
            onClick={() => setOpen(!open)}
          >
            <motion.span aria-hidden="true" className="flex" animate={{ rotate: open ? 135 : 0 }} transition={spring}>
              <Plus />
            </motion.span>
            {open ? ui("close") : t("heading")}
          </Button>
        </div>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id={formId}
              key="form"
              // Only horizontal offsets out here: every vertical space lives inside the animated height, so it closes to exactly 0.
              className="-mx-3 overflow-hidden"
              initial={{ height: 0, opacity: 0, filter: "blur(4px)" }}
              animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }}
              exit={{ height: 0, opacity: 0, filter: "blur(4px)" }}
              transition={unfold}
            >
              {/* The padding replaces the gap under the button and leaves room for the Card's ring and shadow. */}
              <div className="p-3">
                <SeriesForm {...props} onCreated={() => setOpen(false)} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}

/** Picks a Choir, a weekday and a range, previews the dates, then creates the ticked ones as Drafts. */
function SeriesForm({ choirs, locations, today, onCreated }: GeneratorProps & { onCreated: () => void }) {
  const t = useTranslations("Events.schedule.generator")
  const format = useFormatter()
  const errorMessage = useEventErrorMessage()
  const [pending, startTransition] = useTransition()

  const [choirGroupId, setChoirGroupId] = useState("")
  const [weekday, setWeekday] = useState<Weekday>(1)
  const [firstDay, setFirstDay] = useState("")
  const [lastDay, setLastDay] = useState("")
  const [startTime, setStartTime] = useState("18:00")
  const [endTime, setEndTime] = useState("21:00")
  const [locationId, setLocationId] = useState("")
  const [title, setTitle] = useState(t("defaultTitle"))
  const [seriesName, setSeriesName] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewDate[] | null>(null)
  const [ticked, setTicked] = useState<Set<IsoDate>>(new Set())
  const [error, setError] = useState<EventCommandError | null>(null)

  const termDate = firstDay || today
  const defaultName = t("seriesNameDefault", {
    choir: choirs.find(({ id }) => id === choirGroupId)?.name ?? "",
    term: Number(termDate.slice(5, 7)) >= 7 ? "autumn" : "spring",
    year: termDate.slice(0, 4)
  })
  // The name follows the Choir and term until it is edited by hand.
  const name = seriesName ?? defaultName

  // Changing what the dates come from discards a preview of the old ones.
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setPreview(null)
      setError(null)
    }

  const showPreview = () => {
    startTransition(async () => {
      setError(null)
      const { state, dates } = await previewRehearsalSeriesAction({ choirGroupId, weekday, firstDay, lastDay })
      if (state.status === "error") return setError(state.error)
      setPreview(dates ?? [])
      setTicked(new Set((dates ?? []).filter(({ taken }) => !taken).map(({ date }) => date)))
    })
  }

  const create = () => {
    startTransition(async () => {
      setError(null)
      const state = await createRehearsalSeriesAction({
        name,
        choirGroupId,
        title,
        dates: [...ticked],
        startTime,
        endTime,
        locationId: locationId || null
      })
      if (state.status === "error") return setError(state.error)
      toast.add({ type: "success", title: t("created") })
      onCreated()
    })
  }

  const toggle = (date: IsoDate, on: boolean) => {
    const next = new Set(ticked)
    if (on) next.add(date)
    else next.delete(date)
    setTicked(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("choir")}
            name="choirGroupId"
            value={choirGroupId}
            onValueChange={reset(setChoirGroupId)}
            options={[
              { value: "", label: t("chooseChoir") },
              ...choirs.map(({ id, name: choir }) => ({ value: id, label: choir }))
            ]}
          />
          <SelectField
            label={t("weekday")}
            name="weekday"
            value={String(weekday)}
            onValueChange={(day) => reset(setWeekday)(Number(day) as Weekday)}
            options={WEEKDAYS.map((day) => ({
              value: String(day),
              // 2026-11-23 is a Monday, so day 1 to 7 name Monday to Sunday.
              label: format.dateTime(noon(`2026-11-${22 + day}`), { weekday: "long" })
            }))}
          />
          <DateField
            label={t("firstDay")}
            name="firstDay"
            value={firstDay}
            onValueChange={reset(setFirstDay)}
            min={today}
          />
          <DateField
            label={t("lastDay")}
            name="lastDay"
            value={lastDay}
            onValueChange={reset(setLastDay)}
            min={firstDay || today}
            defaultMonth={firstDay || undefined}
          />
          <TimeField label={t("startTime")} value={startTime} onValueChange={setStartTime} />
          <TimeField label={t("endTime")} value={endTime} onValueChange={setEndTime} />
          <SelectField
            label={t("location")}
            name="locationId"
            value={locationId}
            onValueChange={setLocationId}
            options={[
              { value: "", label: t("noLocation") },
              ...locations.filter(({ active }) => active).map(({ id, name: place }) => ({ value: id, label: place }))
            ]}
          />
          <InputField label={t("eventTitle")} name="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="sm:col-span-2">
            <InputField
              label={t("seriesName")}
              name="seriesName"
              value={name}
              onChange={(e) => setSeriesName(e.target.value)}
            />
          </div>
        </div>

        {preview ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="font-medium">{t("datesHeading")}</legend>
            <p className="text-sm text-muted-foreground">{t("datesHelp")}</p>
            <motion.ul className="grid gap-2 sm:grid-cols-2" variants={dateList} initial="hidden" animate="shown">
              {preview.map(({ date, taken }) => (
                <motion.li key={date} variants={dateItem}>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={ticked.has(date)} onCheckedChange={(on) => toggle(date, on)} />
                    <span>{format.dateTime(noon(date), { dateStyle: "full" })}</span>
                    {taken ? <Badge variant="outline">{t("taken")}</Badge> : null}
                  </label>
                </motion.li>
              ))}
            </motion.ul>
          </fieldset>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {preview ? (
            <>
              <Button type="button" onClick={create} disabled={pending || ticked.size === 0}>
                {pending ? t("creating") : t("create", { count: ticked.size })}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={pending}>
                {t("change")}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={showPreview} disabled={pending || !choirGroupId || !firstDay || !lastDay}>
              {pending ? t("previewing") : t("preview")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TimeField({
  label,
  value,
  onValueChange
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <TimeInput id={id} value={value} onValueChange={onValueChange} />
    </Field>
  )
}
