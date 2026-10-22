"use client"

import { useId, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import {
  annualAppointmentDefaults,
  GroupType,
  organisationYearPeriod,
  POSITION_DEFINITIONS,
  type PositionCode,
  positionCodeKey,
  shiftDate
} from "@/core/org-structure"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { CommandDialog } from "../command-dialog"
import {
  cancelAppointmentAction,
  correctAppointmentAction,
  endAppointmentAction,
  replaceAppointmentAction
} from "./appointment-actions"
import type { GroupDetail } from "./query"

export function AppointmentManagement({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups.detail")
  const positionLabel = useTranslations("Groups.positionLabels")
  const year = detail.group.organisationYear
  const choirContext = detail.group.type === GroupType.Choir
  const availableYears = choirContext
    ? [
        ...new Set(
          detail.appointmentYears.flatMap(({ organisationYear }) =>
            organisationYear === null ? [] : [organisationYear]
          )
        )
      ]
    : year === null
      ? []
      : [year]
  const applicablePositions = Object.entries(POSITION_DEFINITIONS).filter(
    ([, definition]) => definition.context === detail.group.type && definition.endPolicy === "annual"
  )
  const choirMembers = detail.directMemberships.map(({ userId, name, startDate, endDate }) => ({
    userId,
    name,
    startDate,
    endDate
  }))
  const choirCandidates = [...new Map(choirMembers.map((member) => [member.userId, member])).values()]
  const annualAppointments = detail.appointments.filter(
    ({ positionCode }) => POSITION_DEFINITIONS[positionCode].endPolicy === "annual"
  )
  const initialAssignment = annualAppointmentDefaults(availableYears, today)
  const [assignmentYear, setAssignmentYear] = useState(initialAssignment?.year)
  const selectedYear = assignmentYear ?? initialAssignment?.year
  const assignmentDates = selectedYear === undefined ? null : annualAppointmentDefaults([selectedYear], today)
  const occupied = new Set(
    annualAppointments
      .filter(
        ({ organisationYear, endDate }) => organisationYear === selectedYear && (endDate === null || endDate > today)
      )
      .map(({ positionCode }) => positionCode)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("positionsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {detail.group.active && (year !== null || choirContext) && availableYears.length > 0 ? (
          <CommandDialog
            trigger={
              <Button type="button" size="sm">
                {t("assignHolder")}
              </Button>
            }
            title={t("positionsTitle")}
            action={replaceAppointmentAction}
            submitLabel={t("assignHolder")}
          >
            <input type="hidden" name="contextGroupId" value={detail.group.id} />
            {choirContext ? (
              <AnnualYearSelect
                label={t("year")}
                name="organisationYear"
                years={availableYears}
                value={selectedYear}
                onChange={setAssignmentYear}
              />
            ) : (
              <input type="hidden" name="organisationYear" value={year as number} />
            )}
            <SelectField
              label={t("position")}
              name="positionCode"
              required
              options={applicablePositions.map(([code]) => ({
                value: code,
                label: t("positionOption", {
                  position: positionLabel(positionCodeKey(code as PositionCode)),
                  occupied: occupied.has(code as PositionCode) ? "true" : "false",
                  replace: t("replaceHolder")
                })
              }))}
            />
            <SelectField
              label={t("holder")}
              name="userId"
              required
              options={
                choirContext
                  ? choirCandidates.map(({ userId, name }) => ({ value: userId, label: name }))
                  : detail.directCandidates.map(({ id, name }) => ({ value: id, label: name }))
              }
            />
            <InputField
              key={`start-${selectedYear}`}
              label={t("startDate")}
              name="startDate"
              defaultValue={assignmentDates?.startDate}
              min={assignmentDates?.min}
              max={assignmentDates?.max}
              type="date"
              required
            />
            <InputField
              key={`end-${selectedYear}`}
              label={t("endDate")}
              name="lastDay"
              defaultValue={assignmentDates?.lastDay}
              min={assignmentDates?.min}
              max={assignmentDates?.max}
              type="date"
              required
            />
          </CommandDialog>
        ) : null}
        {annualAppointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("position")}</TableHead>
                <TableHead>{t("holder")}</TableHead>
                <TableHead>{t("period")}</TableHead>
                <TableHead className="sr-only">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {annualAppointments.map((appointment) => {
                const prepared = appointment.startDate > today
                const open =
                  appointment.startDate <= today && (appointment.endDate === null || appointment.endDate > today)
                const isContextGroup = appointment.contextGroupId === detail.group.id
                const historical = appointment.endDate !== null && appointment.endDate <= today
                const correctable =
                  isContextGroup && (detail.group.active || historical) && (year !== null || choirContext)
                return (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      {positionLabel(positionCodeKey(appointment.positionCode as PositionCode))}
                      {appointment.contextName ? ` · ${appointment.contextName}` : ""}
                    </TableCell>
                    <TableCell>{appointment.name}</TableCell>
                    <TableCell>
                      {t("periodValue", {
                        start: appointment.startDate,
                        end: appointment.endDate ? shiftDate(appointment.endDate, -1) : t("ongoing")
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {correctable ? (
                          <AppointmentCorrectionDialog
                            detail={detail}
                            appointment={appointment}
                            today={today}
                            choirContext={choirContext}
                            applicablePositions={applicablePositions}
                            yearOptions={
                              choirContext
                                ? availableYears
                                : [
                                    ...new Set(
                                      detail.annualContexts.flatMap(({ organisationYear }) =>
                                        organisationYear === null ? [] : [organisationYear]
                                      )
                                    )
                                  ]
                            }
                          />
                        ) : null}
                        {isContextGroup && open && detail.group.active ? (
                          <CommandDialog
                            trigger={
                              <Button type="button" variant="ghost" size="sm">
                                {t("endHolding")}
                              </Button>
                            }
                            title={t("endHoldingTitle", { name: appointment.name, position: appointment.position })}
                            action={endAppointmentAction}
                            submitLabel={t("endHolding")}
                          >
                            <input type="hidden" name="appointmentId" value={appointment.id} />
                            <InputField label={t("endDate")} name="lastDay" defaultValue={today} type="date" required />
                          </CommandDialog>
                        ) : null}
                        {isContextGroup && prepared && detail.group.active ? (
                          <CommandDialog
                            trigger={
                              <Button type="button" variant="ghost" size="sm">
                                {t("cancelAppointment")}
                              </Button>
                            }
                            title={t("cancelPreparedTitle", { name: appointment.name })}
                            action={cancelAppointmentAction}
                            submitLabel={t("cancelAppointment")}
                            destructive
                          >
                            <input type="hidden" name="appointmentId" value={appointment.id} />
                          </CommandDialog>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

type Appointment = GroupDetail["appointments"][number]

function AnnualYearSelect({
  label,
  name,
  years,
  value,
  onChange
}: {
  label: string
  name: string
  years: number[]
  value: number | undefined
  onChange: (year: number) => void
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        name={name}
        required
        value={value === undefined ? undefined : String(value)}
        onValueChange={(selected) => {
          if (selected) onChange(Number(selected))
        }}
        items={years.map((year) => ({ value: String(year), label: `${year}/${year + 1}` }))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {`${year}/${year + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function AppointmentCorrectionDialog({
  detail,
  appointment,
  today,
  choirContext,
  applicablePositions,
  yearOptions
}: {
  detail: GroupDetail
  appointment: Appointment
  today: string
  choirContext: boolean
  applicablePositions: [string, (typeof POSITION_DEFINITIONS)[PositionCode]][]
  yearOptions: number[]
}) {
  const t = useTranslations("Groups.detail")
  const positionLabel = useTranslations("Groups.positionLabels")
  const initialYear = appointment.organisationYear ?? yearOptions[0] ?? 0
  const [selectedYear, setSelectedYear] = useState(initialYear)
  const [selectedContextId, setSelectedContextId] = useState(appointment.contextGroupId)
  const years = [...new Set([...yearOptions, initialYear])].sort((a, b) => b - a)
  const defaults = annualAppointmentDefaults([selectedYear], today)
  const sameYear = selectedYear === initialYear
  const bounds = organisationYearPeriod(selectedYear)
  const startDate = sameYear ? appointment.startDate : (defaults?.startDate ?? bounds.startDate)
  const lastDay = sameYear && appointment.endDate ? shiftDate(appointment.endDate, -1) : defaults?.lastDay
  const setYearAndContext = (nextYear: number) => {
    setSelectedYear(nextYear)
    if (!choirContext) {
      const nextContext = detail.annualContexts.find(({ organisationYear }) => organisationYear === nextYear)
      if (nextContext) setSelectedContextId(nextContext.id)
    }
  }
  return (
    <CommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("correctAppointment")}
        </Button>
      }
      title={t("correctAppointmentTitle", { name: appointment.name })}
      action={correctAppointmentAction}
      submitLabel={t("correctAppointment")}
    >
      <input type="hidden" name="appointmentId" value={appointment.id} />
      <SelectField
        label={t("position")}
        name="positionCode"
        required
        defaultValue={appointment.positionCode}
        options={applicablePositions.map(([code]) => ({
          value: code,
          label: positionLabel(positionCodeKey(code as PositionCode))
        }))}
      />
      {choirContext ? (
        <SelectField
          label={t("groupContext")}
          name="contextGroupId"
          required
          defaultValue={appointment.contextGroupId}
          options={detail.choirs.map((context) => ({ value: context.id, label: context.name }))}
        />
      ) : (
        <AnnualContextSelect
          label={t("groupContext")}
          contexts={detail.annualContexts.filter(({ organisationYear }) => organisationYear === selectedYear)}
          value={selectedContextId}
          onChange={(id, contextYear) => {
            setSelectedContextId(id)
            setSelectedYear(contextYear)
          }}
        />
      )}
      <AnnualYearSelect
        label={t("year")}
        name="organisationYear"
        years={years}
        value={selectedYear}
        onChange={setYearAndContext}
      />
      <SelectField
        label={t("holder")}
        name="userId"
        required
        defaultValue={appointment.userId}
        options={
          choirContext
            ? detail.directMemberships.map(({ userId, name }) => ({ value: userId, label: name }))
            : detail.directCandidates.map(({ id, name }) => ({ value: id, label: name }))
        }
      />
      <InputField
        key={`correction-start-${selectedYear}`}
        label={t("startDate")}
        name="startDate"
        defaultValue={startDate}
        type="date"
        required
        min={bounds.startDate}
        max={shiftDate(bounds.endDate, -1)}
      />
      <InputField
        key={`correction-end-${selectedYear}`}
        label={t("endDate")}
        name="lastDay"
        defaultValue={lastDay}
        type="date"
        required
        min={bounds.startDate}
        max={shiftDate(bounds.endDate, -1)}
      />
    </CommandDialog>
  )
}

function AnnualContextSelect({
  label,
  contexts,
  value,
  onChange
}: {
  label: string
  contexts: { id: string; name: string; organisationYear: number | null }[]
  value: string
  onChange: (id: string, year: number) => void
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        name="contextGroupId"
        required
        value={value}
        onValueChange={(selected) => {
          const context = contexts.find(({ id: contextId }) => contextId === selected)
          if (context?.organisationYear !== null && context?.organisationYear !== undefined)
            onChange(context.id, context.organisationYear)
        }}
        items={contexts.map((context) => ({
          value: context.id,
          label: context.name
        }))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {contexts.map((context) => (
            <SelectItem key={context.id} value={context.id}>
              {context.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
