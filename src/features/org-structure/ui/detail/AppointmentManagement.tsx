"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { POSITION_DEFINITIONS, type PositionCode } from "../../model"
import { shiftDate } from "../../model/dates"
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
  const choirContext = detail.group.type === "Choir"
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
  const choirMembers = [
    ...detail.directMemberships.map(({ userId, name, startDate, endDate }) => ({ userId, name, startDate, endDate })),
    ...detail.legacyMemberships.map(({ userId, name, startDate, endDate }) => ({ userId, name, startDate, endDate }))
  ]
  const choirCandidates = [...new Map(choirMembers.map((member) => [member.userId, member])).values()]
  const annualAppointments = detail.appointments.filter(
    ({ positionCode }) => POSITION_DEFINITIONS[positionCode].endPolicy === "annual"
  )
  const occupied = new Set(
    annualAppointments
      .filter(({ endDate }) => endDate === null || endDate > today)
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
              <SelectField
                label={t("year")}
                name="organisationYear"
                required
                options={availableYears.map((value) => ({ value: String(value), label: `${value}/${value + 1}` }))}
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
                label: `${positionLabel(code as PositionCode)}${occupied.has(code as PositionCode) ? ` · ${t("replaceHolder")}` : ""}`
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
            <InputField label={t("startDate")} name="startDate" defaultValue={today} type="date" required />
            <InputField
              label={t("endDate")}
              name="lastDay"
              defaultValue={`${(year ?? availableYears[0] ?? new Date().getFullYear()) + 1}-06-30`}
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
                const correctable = isContextGroup && detail.group.active && (year !== null || choirContext)
                return (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      {positionLabel(appointment.positionCode as PositionCode)}
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
                                label: positionLabel(code as PositionCode)
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
                              <SelectField
                                label={t("groupContext")}
                                name="contextGroupId"
                                required
                                defaultValue={appointment.contextGroupId}
                                options={detail.annualContexts.map((context) => ({
                                  value: context.id,
                                  label: `${context.name} (${context.organisationYear}/${(context.organisationYear ?? 0) + 1})`
                                }))}
                              />
                            )}
                            <SelectField
                              label={t("year")}
                              name="organisationYear"
                              required
                              defaultValue={String(appointment.organisationYear)}
                              options={(choirContext
                                ? [...new Set(availableYears.map(String))]
                                : [
                                    ...new Set(
                                      detail.annualContexts.map(({ organisationYear }) => String(organisationYear))
                                    )
                                  ]
                              ).map((value) => ({ value, label: value }))}
                            />
                            <SelectField
                              label={t("holder")}
                              name="userId"
                              required
                              defaultValue={appointment.userId}
                              options={
                                choirContext
                                  ? choirCandidates.map(({ userId, name }) => ({ value: userId, label: name }))
                                  : detail.directCandidates.map(({ id, name }) => ({ value: id, label: name }))
                              }
                            />
                            <InputField
                              label={t("startDate")}
                              name="startDate"
                              defaultValue={appointment.startDate}
                              type="date"
                              required
                            />
                            <InputField
                              label={t("endDate")}
                              name="lastDay"
                              defaultValue={
                                appointment.endDate
                                  ? shiftDate(appointment.endDate, -1)
                                  : `${(appointment.organisationYear ?? year ?? 0) + 1}-06-30`
                              }
                              type="date"
                              required
                            />
                          </CommandDialog>
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
                            <input type="hidden" name="today" value={today} />
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
