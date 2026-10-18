"use client"

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"
import Link from "next/link"
import { type FormEvent, startTransition, useActionState, useEffect, useId, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { RichTextEditor } from "@/features/rich-text"
import { InputField, SelectField } from "@/shared/forms/fields"
import { useUnsavedForm } from "@/shared/hooks/use-unsaved-form"
import { Alert, AlertAction, AlertDescription } from "@/shared/ui/base/alert"
import { Button, buttonVariants } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/shared/ui/base/field"
import { Switch } from "@/shared/ui/base/switch"
import { Textarea } from "@/shared/ui/base/textarea"
import { toast } from "@/shared/ui/base/toast"
import { eventDocument } from "../../event-document"
import {
  collectsParticipation,
  DEFAULT_PARTICIPATION_MODE,
  EVENT_TYPES,
  type EventType,
  PARTICIPATION_MODES,
  type ParticipationMode
} from "../../model"
import { type EventCommandState, IDLE } from "../command-state"
import { ERROR_FIELD, type EventFormField, useEventErrorMessage } from "../errors"
import { DETAIL_LABEL_MAX_LENGTH, LONG_TEXT_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH, TITLE_MAX_LENGTH } from "../limits"
import type { EventFormOptions, EventFormValues } from "./query"
import { eventFormVersion, parseStoredEvent, snapshotEventForm } from "./unsaved-event"

const VOICE_FAMILIES = ["S", "A", "T", "B"]

type EventFormProps = {
  action: (state: EventCommandState, formData: FormData) => Promise<EventCommandState>
  initial: EventFormValues
  options: EventFormOptions
  submitLabel: string
  /** Where Cancel leads; without it there is no Cancel, as on an Event's own page. */
  cancelHref?: string
  /** Names the Event's unsaved copy: its id, or `"new"`. */
  unsavedSlot: string
}

/**
 * The whole Event, saved as one change. Every violation the module reports is shown next to the
 * field it concerns. What has been typed but not saved is kept in the tab's session, as on the
 * Post form, so a reload does not lose it.
 */
export function EventForm({ action, initial, options, submitLabel, cancelHref, unsavedSlot }: EventFormProps) {
  const t = useTranslations("Events.form")
  const common = useTranslations("Common")
  const errorMessage = useEventErrorMessage()
  const [state, formAction, pending] = useActionState(action, IDLE)
  const unsaved = useUnsavedForm({
    storageKey: `event.${unsavedSlot}`,
    version: eventFormVersion(initial),
    parse: parseStoredEvent
  })
  const { saveFailed, saved } = unsaved
  const form = useRef<HTMLFormElement>(null)
  const latest = useRef<EventFormValues | null>(null)
  const handled = useRef<number | null>(null)
  const startFrom = unsaved.restored ?? initial

  // Runs once per settled submission: a failure keeps the copy for the next attempt, and a save
  // that stays on the page drops it.
  useEffect(() => {
    if (state.status === "error") saveFailed()
    if (state.status !== "success" || handled.current === state.completedAt) return
    handled.current = state.completedAt
    latest.current = null
    saved()
    toast.add({ type: "success", title: t("saved") })
  }, [state, saveFailed, saved, t])

  const errorFor = (field: EventFormField) =>
    state.status === "error" && ERROR_FIELD[state.error] === field ? errorMessage(state.error) : undefined

  // Read once the change has settled: a Select or a new row reaches the form after its event.
  const remember = () => {
    setTimeout(() => {
      if (!form.current) return
      latest.current = snapshotEventForm(form.current, latest.current ?? startFrom)
      unsaved.keep(latest.current)
    }, 0)
  }

  const discard = () => {
    latest.current = null
    unsaved.discard()
  }

  // Submitted by hand rather than through `action`: React resets an action form's fields when the
  // action settles, which would throw away the Event the Admin is about to correct after an error.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    unsaved.saving()
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  return (
    <form ref={form} onSubmit={submit} onInput={remember} className="flex flex-col gap-6">
      {unsaved.restored && state.status === "idle" ? (
        <Alert>
          <AlertDescription>{t("unsavedRestored")}</AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" onClick={discard}>
              {t("discardUnsaved")}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {/* A restored copy arrives after the fields have mounted, and they read their defaults once,
          so they start over whenever the copy comes or goes. */}
      <EventFields
        key={unsaved.restored ? "restored" : "saved"}
        initial={startFrom}
        options={options}
        errorFor={errorFor}
        onEdit={remember}
      />

      <div className="flex flex-col gap-3">
        <FieldError>{errorFor("form")}</FieldError>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : submitLabel}
          </Button>
          {cancelHref ? (
            <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
              {common("cancel")}
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  )
}

type EventFieldsProps = {
  initial: EventFormValues
  options: EventFormOptions
  errorFor: (field: EventFormField) => string | undefined
  /** Called after every change that no input event reports: a Select, a switch, the editor, a row. */
  onEdit: () => void
}

function EventFields({ initial, options, errorFor, onEdit }: EventFieldsProps) {
  const t = useTranslations("Events.form")
  const types = useTranslations("Events.types")
  const modes = useTranslations("Events.modes")
  const [type, setType] = useState<EventType>(initial.type)
  const [mode, setMode] = useState<ParticipationMode>(initial.participationMode)
  const [allDay, setAllDay] = useState(initial.allDay)
  const descriptionLabelId = useId()

  // Choosing the type sets its default mode, which the Admin may then override.
  const changeType = (next: string) => {
    setType(next as EventType)
    setMode(DEFAULT_PARTICIPATION_MODE[next as EventType])
    onEdit()
  }

  const userOptions = (none: string) => [
    { value: "", label: none },
    ...options.users.map((user) => ({ value: user.id, label: t("userOption", { name: user.name, email: user.email }) }))
  ]
  const groupOptions = (none: string) => [
    { value: "", label: none },
    ...options.groups.map((group) => ({
      value: group.id,
      label: group.active ? group.name : t("archivedOption", { name: group.name })
    }))
  ]

  return (
    <>
      <input type="hidden" name="allDay" value={String(allDay)} />

      <Card>
        <CardHeader>
          <CardTitle>{t("aboutTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SelectField
              label={t("type")}
              name="type"
              value={type}
              onValueChange={changeType}
              options={EVENT_TYPES.map((value) => ({ value, label: types(value) }))}
              required
            />
            <InputField
              label={t("title")}
              name="title"
              defaultValue={initial.title}
              maxLength={TITLE_MAX_LENGTH}
              required
              invalid={Boolean(errorFor("title"))}
              error={errorFor("title")}
            />
            <Field data-invalid={Boolean(errorFor("description"))}>
              <FieldTitle id={descriptionLabelId}>{t("description")}</FieldTitle>
              <RichTextEditor
                schema={eventDocument}
                name="description"
                defaultValue={initial.description ?? undefined}
                labelledBy={descriptionLabelId}
                placeholder={t("descriptionPlaceholder")}
                onChange={onEdit}
              />
              <FieldError>{errorFor("description")}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("whenTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                id="event-all-day"
                checked={allDay}
                onCheckedChange={(checked) => {
                  setAllDay(checked)
                  onEdit()
                }}
              />
              <FieldLabel htmlFor="event-all-day">{t("allDay")}</FieldLabel>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {allDay ? (
                <>
                  <InputField
                    label={t("firstDay")}
                    name="firstDay"
                    type="date"
                    defaultValue={initial.firstDay}
                    required
                  />
                  <InputField
                    label={t("lastDay")}
                    name="lastDay"
                    type="date"
                    defaultValue={initial.lastDay}
                    required
                    invalid={Boolean(errorFor("schedule"))}
                    error={errorFor("schedule")}
                  />
                </>
              ) : (
                <>
                  <InputField
                    label={t("startsAt")}
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={initial.startsAt}
                    required
                  />
                  <InputField
                    label={t("endsAt")}
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={initial.endsAt}
                    required
                    invalid={Boolean(errorFor("schedule"))}
                    error={errorFor("schedule")}
                  />
                </>
              )}
            </div>
            {allDay ? null : (
              <InputField
                label={t("callTime")}
                description={t("callTimeDescription")}
                name="callTime"
                type="datetime-local"
                defaultValue={initial.callTime}
                invalid={Boolean(errorFor("callTime"))}
                error={errorFor("callTime")}
              />
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("participationTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SelectField
              label={t("participationMode")}
              description={modes(`${mode}Description`)}
              name="participationMode"
              value={mode}
              onValueChange={(next) => {
                setMode(next as ParticipationMode)
                onEdit()
              }}
              options={PARTICIPATION_MODES.map((value) => ({ value, label: modes(value) }))}
              required
              invalid={Boolean(errorFor("participationMode"))}
              error={errorFor("participationMode")}
            />
            {collectsParticipation(mode) ? (
              <InputField
                label={t("respondBy")}
                name="respondBy"
                type="datetime-local"
                defaultValue={initial.respondBy}
                invalid={Boolean(errorFor("respondBy"))}
                error={errorFor("respondBy")}
              />
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("whereTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SelectField
              label={t("location")}
              name="locationId"
              onValueChange={onEdit}
              defaultValue={initial.locationId}
              options={[
                { value: "", label: t("noLocation") },
                ...options.locations.map((location) => ({
                  value: location.id,
                  label: location.active ? location.name : t("archivedOption", { name: location.name })
                }))
              ]}
              invalid={Boolean(errorFor("location"))}
              error={errorFor("location")}
            />
            <InputField
              label={t("locationText")}
              description={t("locationTextDescription")}
              name="locationText"
              defaultValue={initial.locationText}
              maxLength={SHORT_TEXT_MAX_LENGTH}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("organiserTitle")}</CardTitle>
          <CardDescription>{t("organiserDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SelectField
              label={t("organiserGroup")}
              name="organiserGroupId"
              onValueChange={onEdit}
              defaultValue={initial.organiserGroupId}
              options={groupOptions(t("noOrganiserGroup"))}
              invalid={Boolean(errorFor("organiserGroup"))}
              error={errorFor("organiserGroup")}
            />
            {type === "Rehearsal" ? (
              <SelectField
                label={t("leader")}
                description={t("leaderDescription")}
                name="leaderUserId"
                onValueChange={onEdit}
                defaultValue={initial.leaderUserId}
                options={userOptions(t("noLeader"))}
                invalid={Boolean(errorFor("extension"))}
                error={errorFor("extension")}
              />
            ) : null}
            {type === "Gig" ? (
              <>
                <SelectField
                  label={t("responsible")}
                  description={t("responsibleDescription")}
                  name="responsibleUserId"
                  onValueChange={onEdit}
                  defaultValue={initial.responsibleUserId}
                  options={userOptions(t("noResponsible"))}
                  invalid={Boolean(errorFor("extension"))}
                  error={errorFor("extension")}
                />
                <InputField
                  label={t("contactName")}
                  name="contactName"
                  defaultValue={initial.contactName}
                  maxLength={SHORT_TEXT_MAX_LENGTH}
                />
                <Field>
                  <FieldLabel htmlFor="event-contact-details">{t("contactDetails")}</FieldLabel>
                  <Textarea
                    id="event-contact-details"
                    name="contactDetails"
                    defaultValue={initial.contactDetails}
                    maxLength={LONG_TEXT_MAX_LENGTH}
                  />
                  <FieldDescription>{t("contactDetailsDescription")}</FieldDescription>
                </Field>
              </>
            ) : null}
            {type === "Social" ? (
              <InputField
                label={t("costInfo")}
                description={t("costInfoDescription")}
                name="costInfo"
                defaultValue={initial.costInfo}
                maxLength={LONG_TEXT_MAX_LENGTH}
              />
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <TargetRows
        initial={initial.targets}
        groupOptions={groupOptions(t("anyGroup"))}
        error={errorFor("targets")}
        onEdit={onEdit}
      />
      <DetailRows initial={initial.details} error={errorFor("details")} onEdit={onEdit} />
    </>
  )
}

/** Rows that keep their own identity, so React moves a row's inputs with it when rows are reordered. */
function useRows<Row>(initial: Row[], onChange: () => void) {
  const next = useRef(initial.length)
  const [rows, setRows] = useState(() => initial.map((row, index) => ({ key: `r${index}`, ...row })))
  const change = (update: (current: typeof rows) => typeof rows) => {
    setRows(update)
    onChange()
  }
  return {
    rows,
    add: (row: Row) => change((current) => [...current, { key: `r${next.current++}`, ...row }]),
    remove: (key: string) => change((current) => current.filter((row) => row.key !== key)),
    move: (index: number, by: -1 | 1) =>
      change((current) => {
        const moved = [...current]
        const [row] = moved.splice(index, 1)
        if (row) moved.splice(index + by, 0, row)
        return moved
      })
  }
}

function TargetRows({
  initial,
  groupOptions,
  error,
  onEdit
}: {
  initial: EventFormValues["targets"]
  groupOptions: { value: string; label: string }[]
  error: string | undefined
  onEdit: () => void
}) {
  const t = useTranslations("Events.form")
  const { rows, add, remove } = useRows(initial, onEdit)
  const voiceOptions = [
    { value: "", label: t("anyVoice") },
    ...VOICE_FAMILIES.map((voice) => ({ value: voice, label: voice }))
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("targetsTitle")}</CardTitle>
        <CardDescription>{t("targetsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? <p className="text-sm font-medium">{t("everyoneInCsk")}</p> : null}
        {rows.map((row, index) => (
          <div key={row.key} className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_auto]">
            <SelectField
              label={t("targetGroup", { number: index + 1 })}
              name={`target.${row.key}.groupId`}
              defaultValue={row.groupId}
              options={groupOptions}
              onValueChange={onEdit}
            />
            <SelectField
              label={t("targetVoice")}
              name={`target.${row.key}.voiceFamily`}
              defaultValue={row.voiceFamily}
              options={voiceOptions}
              onValueChange={onEdit}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(row.key)}
              aria-label={t("removeTarget", { number: index + 1 })}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ))}
        <FieldError>{error}</FieldError>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => add({ groupId: "", voiceFamily: "" })}>
            <Plus aria-hidden="true" />
            {t("addTarget")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DetailRows({
  initial,
  error,
  onEdit
}: {
  initial: EventFormValues["details"]
  error: string | undefined
  onEdit: () => void
}) {
  const t = useTranslations("Events.form")
  const { rows, add, remove, move } = useRows(initial, onEdit)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("detailsTitle")}</CardTitle>
        <CardDescription>{t("detailsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <div key={row.key} className="grid items-end gap-3 sm:grid-cols-[12rem_1fr_auto]">
            <InputField
              label={t("detailLabel", { number: index + 1 })}
              name={`detail.${row.key}.label`}
              defaultValue={row.label}
              placeholder={t("detailLabelPlaceholder")}
              maxLength={DETAIL_LABEL_MAX_LENGTH}
              required
            />
            <InputField
              label={t("detailValue")}
              name={`detail.${row.key}.value`}
              defaultValue={row.value}
              placeholder={t("detailValuePlaceholder")}
              maxLength={LONG_TEXT_MAX_LENGTH}
              required
            />
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={t("moveDetailUp", { number: index + 1 })}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
                aria-label={t("moveDetailDown", { number: index + 1 })}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(row.key)}
                aria-label={t("removeDetail", { number: index + 1 })}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </div>
        ))}
        <FieldError>{error}</FieldError>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => add({ label: "", value: "" })}>
            <Plus aria-hidden="true" />
            {t("addDetail")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
