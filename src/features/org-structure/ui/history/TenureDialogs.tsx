"use client"

import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import {
  organisationYearPeriod,
  POSITION_DEFINITIONS,
  type PositionCode,
  positionCodeKey,
  shiftDate
} from "@/core/org-structure"
import { DateField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { yearLabel } from "../../roster"
import { GroupCommandDialog } from "../group-command-dialog"
import { usePeople } from "../PeopleContext"
import { PersonPicker } from "../PersonPicker"
import { correctTenureAction, recordTenureAction } from "./actions"
import type { GroupHistory } from "./query"

type Tenure = GroupHistory["appointments"][number]

const isAnnual = (code: PositionCode) => POSITION_DEFINITIONS[code].endPolicy === "annual"

export function RecordTenureDialog({ history }: { history: GroupHistory }) {
  const t = useTranslations("OrgAdmin.history")
  return (
    <GroupCommandDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          {t("recordHolder")}
        </Button>
      }
      title={t("recordHolder")}
      description={t("recordDescription")}
      action={recordTenureAction}
      submitLabel={t("record")}
    >
      <RecordFields history={history} />
    </GroupCommandDialog>
  )
}

function RecordFields({ history }: { history: GroupHistory }) {
  const t = useTranslations("OrgAdmin.history")
  const { people } = usePeople()
  const { group, positionCodes, years } = history
  const [code, setCode] = useState(positionCodes[0] as PositionCode)
  const [year, setYear] = useState(group.organisationYear ?? years[0])
  return (
    <>
      <input type="hidden" name="contextGroupId" value={group.id} />
      <PositionField codes={positionCodes} value={code} onChange={setCode} />
      {isAnnual(code) ? (
        group.organisationYear === null ? (
          <YearField years={years} value={year} onChange={setYear} />
        ) : (
          <input type="hidden" name="organisationYear" value={group.organisationYear} />
        )
      ) : null}
      <PersonPicker label={t("person")} people={people} name="userId" />
      <DateFields year={isAnnual(code) ? year : undefined} />
    </>
  )
}

export function CorrectTenureDialog({ history, tenure }: { history: GroupHistory; tenure: Tenure }) {
  const t = useTranslations("OrgAdmin.history")
  return (
    <GroupCommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm" aria-label={t("correctFor", { name: tenure.name })}>
          {t("correct")}
        </Button>
      }
      title={t("correctFor", { name: tenure.name })}
      description={t("correctDescription")}
      action={correctTenureAction}
      submitLabel={t("save")}
    >
      <input type="hidden" name="appointmentId" value={tenure.id} />
      <CorrectionFields history={history} tenure={tenure} />
    </GroupCommandDialog>
  )
}

/** The dates first, since they are what is usually wrong; the rest of the record is tucked away below. */
function CorrectionFields({ history, tenure }: { history: GroupHistory; tenure: Tenure }) {
  const t = useTranslations("OrgAdmin.history")
  const { people } = usePeople()
  const { group, contexts, years } = history
  const annual = isAnnual(tenure.positionCode)
  const annualGroup = group.organisationYear !== null
  const codes = history.positionCodes.filter((code) => isAnnual(code) === annual)
  const [code, setCode] = useState<PositionCode>(tenure.positionCode)
  const [contextId, setContextId] = useState(group.id)
  const [year, setYear] = useState(tenure.organisationYear ?? undefined)
  const [pickedId, setPickedId] = useState<string>()
  const originalYear = year === (tenure.organisationYear ?? undefined)

  return (
    <>
      <DateFields year={year} tenure={originalYear ? tenure : undefined} />
      <details className="rounded-2xl border px-4 py-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">{t("somethingElse")}</summary>
        <div className="mt-4 flex flex-col gap-4">
          {codes.length > 1 ? (
            <PositionField codes={codes} value={code} onChange={setCode} />
          ) : (
            <input type="hidden" name="positionCode" value={code} />
          )}
          {annualGroup ? (
            <SelectField
              label={t("year")}
              name="contextGroupId"
              value={contextId}
              onValueChange={(id) => {
                setContextId(id)
                setYear(contexts.find((context) => context.id === id)?.organisationYear ?? year)
              }}
              options={contexts.flatMap(({ id, organisationYear }) =>
                organisationYear === null ? [] : [{ value: id, label: yearLabel(organisationYear) }]
              )}
            />
          ) : contexts.length > 1 ? (
            <SelectField
              label={t("heldIn")}
              name="contextGroupId"
              value={contextId}
              onValueChange={setContextId}
              options={contexts.map(({ id, name }) => ({ value: id, label: name }))}
            />
          ) : (
            <input type="hidden" name="contextGroupId" value={contextId} />
          )}
          {annual && !annualGroup ? (
            <YearField
              years={year === undefined || years.includes(year) ? years : [year, ...years]}
              value={year}
              onChange={setYear}
            />
          ) : null}
          {annualGroup && year !== undefined ? <input type="hidden" name="organisationYear" value={year} /> : null}
          <PersonPicker
            label={t("otherPerson", { name: tenure.name })}
            people={people.filter(({ id }) => id !== tenure.userId)}
            name="otherUserId"
            onPick={([userId]) => setPickedId(userId)}
            optional
          />
        </div>
      </details>
      <input type="hidden" name="userId" value={pickedId ?? tenure.userId} />
    </>
  )
}

function PositionField({
  codes,
  value,
  onChange
}: {
  codes: PositionCode[]
  value: PositionCode
  onChange: (code: PositionCode) => void
}) {
  const t = useTranslations("OrgAdmin.history")
  const labels = useTranslations("Groups.positionLabels")
  return (
    <SelectField
      label={t("position")}
      name="positionCode"
      value={value}
      onValueChange={(code) => onChange(code as PositionCode)}
      required
      options={codes.map((code) => ({ value: code, label: labels(positionCodeKey(code)) }))}
    />
  )
}

function YearField({
  years,
  value,
  onChange
}: {
  years: number[]
  value: number | undefined
  onChange: (year: number) => void
}) {
  const t = useTranslations("OrgAdmin.history")
  return (
    <SelectField
      label={t("year")}
      name="organisationYear"
      value={String(value ?? "")}
      onValueChange={(year) => onChange(Number(year))}
      required
      options={years.map((year) => ({ value: String(year), label: yearLabel(year) }))}
    />
  )
}

/** A tenure's dates, kept within its year when it has one. */
function DateFields({ year, tenure }: { year?: number; tenure?: Tenure }) {
  const t = useTranslations("OrgAdmin.history")
  const bounds = year === undefined ? null : organisationYearPeriod(year)
  const lastDay = bounds ? shiftDate(bounds.endDate, -1) : undefined
  return (
    <div key={year} className="grid gap-4 sm:grid-cols-2">
      <DateField
        label={t("firstDay")}
        name="startDate"
        defaultValue={tenure?.startDate ?? bounds?.startDate}
        min={bounds?.startDate}
        max={lastDay}
        required
      />
      <DateField
        label={t("lastDay")}
        description={bounds ? undefined : t("lastDayHelp")}
        name="lastDay"
        defaultValue={tenure?.endDate ? shiftDate(tenure.endDate, -1) : lastDay}
        min={bounds?.startDate}
        max={lastDay}
        required={bounds !== null}
      />
    </div>
  )
}
