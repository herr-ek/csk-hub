"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { POSITION_DEFINITIONS, type PositionCode } from "../../model"
import { shiftDate } from "../../model/dates"
import { CommandDialog } from "../command-dialog"
import { cancelAppointmentAction } from "./appointment-actions"
import {
  assignFluidAppointmentAction,
  correctFluidAppointmentAction,
  endFluidAppointmentAction
} from "./fluid-appointment-actions"
import type { GroupDetail } from "./query"

export function FluidAppointmentManagement({ detail, today }: { detail: GroupDetail; today: string }) {
  const t = useTranslations("Groups.detail")
  const labels = useTranslations("Groups.positionLabels")
  const positions = Object.entries(POSITION_DEFINITIONS).filter(
    ([, definition]) => definition.context === detail.group.type && definition.endPolicy === "fluid"
  )
  const fluid = detail.appointments.filter(({ organisationYear }) => organisationYear === null)
  const contexts = detail.fluidContexts

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("fluidResponsibilitiesTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {detail.group.active && positions.length > 0 ? (
          <CommandDialog
            trigger={
              <Button type="button" size="sm">
                {t("assignFluidResponsibility")}
              </Button>
            }
            title={t("fluidResponsibilitiesTitle")}
            action={assignFluidAppointmentAction}
            submitLabel={t("assignFluidResponsibility")}
          >
            <input type="hidden" name="contextGroupId" value={detail.group.id} />
            <SelectField
              label={t("position")}
              name="positionCode"
              required
              options={positions.map(([code]) => ({ value: code, label: labels(code as PositionCode) }))}
            />
            <SelectField
              label={t("holder")}
              name="userId"
              required
              options={detail.appointmentCandidates.map(({ id, name }) => ({ value: id, label: name }))}
            />
            <InputField label={t("startDate")} name="startDate" defaultValue={today} type="date" required />
          </CommandDialog>
        ) : null}
        {fluid.length === 0 ? (
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
              {fluid.map((appointment) => {
                const open =
                  appointment.startDate <= today && (appointment.endDate === null || appointment.endDate > today)
                const prepared = appointment.startDate > today
                return (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      {labels(appointment.positionCode as PositionCode)}
                      {appointment.contextGroupId !== detail.group.id ? ` · ${appointment.contextName}` : ""}
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
                        {appointment.contextGroupId === detail.group.id && detail.group.active ? (
                          <CommandDialog
                            trigger={
                              <Button type="button" variant="ghost" size="sm">
                                {t("correctAppointment")}
                              </Button>
                            }
                            title={t("correctAppointmentTitle", { name: appointment.name })}
                            action={correctFluidAppointmentAction}
                            submitLabel={t("correctAppointment")}
                          >
                            <input type="hidden" name="appointmentId" value={appointment.id} />
                            <SelectField
                              label={t("position")}
                              name="positionCode"
                              required
                              defaultValue={appointment.positionCode}
                              options={positions.map(([code]) => ({
                                value: code,
                                label: labels(code as PositionCode)
                              }))}
                            />
                            <SelectField
                              label={t("groupContext")}
                              name="contextGroupId"
                              required
                              defaultValue={appointment.contextGroupId}
                              options={contexts.map(({ id, name }) => ({ value: id, label: name }))}
                            />
                            <SelectField
                              label={t("holder")}
                              name="userId"
                              required
                              defaultValue={appointment.userId}
                              options={detail.appointmentCandidates.map(({ id, name }) => ({ value: id, label: name }))}
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
                              defaultValue={appointment.endDate ? shiftDate(appointment.endDate, -1) : ""}
                              type="date"
                            />
                          </CommandDialog>
                        ) : null}
                        {open && appointment.contextGroupId === detail.group.id && detail.group.active ? (
                          <CommandDialog
                            trigger={
                              <Button type="button" variant="ghost" size="sm">
                                {t("endHolding")}
                              </Button>
                            }
                            title={t("endHoldingTitle", { name: appointment.name, position: appointment.position })}
                            action={endFluidAppointmentAction}
                            submitLabel={t("endHolding")}
                          >
                            <input type="hidden" name="appointmentId" value={appointment.id} />
                            <InputField label={t("endDate")} name="lastDay" defaultValue={today} type="date" required />
                          </CommandDialog>
                        ) : null}
                        {prepared && appointment.contextGroupId === detail.group.id && detail.group.active ? (
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
