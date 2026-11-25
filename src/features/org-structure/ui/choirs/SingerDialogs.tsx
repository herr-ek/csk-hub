"use client"

import { type ReactElement, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { GroupType, positionCodeKey } from "@/core/org-structure"
import { contains, VOICE_DIVISIONS, type VoiceDivision } from "@/features/voice/model"
import { DateField, SelectField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import type { ChoirStructure, DependentAppointment, Person, SingerPlacement } from "../../roster-reads"
import { GroupCommandDialog } from "../group-command-dialog"
import { Notice } from "../positions/PositionDialogs"
import { changeVoiceAction, leaveChoirAction, placeSingerAction } from "./actions"

/** The Voices a Choir's Sections sing, each with the Section it places a singer in. */
function voiceOptions(choir: ChoirStructure) {
  return VOICE_DIVISIONS.flatMap((voice) => {
    const section = choir.sections.find((own) => contains(own.voice, voice))
    return section ? [{ voice, section }] : []
  })
}

function VoiceField({
  choir,
  value,
  onChange
}: {
  choir: ChoirStructure
  value: string
  onChange: (voice: string) => void
}) {
  const t = useTranslations("OrgAdmin.choirs")
  return (
    <SelectField
      label={t("voice")}
      name="voice"
      value={value}
      onValueChange={onChange}
      required
      options={voiceOptions(choir).map(({ voice, section }) => ({
        value: voice,
        label: section.name.endsWith(voice) ? section.name : t("voiceInSection", { voice, section: section.name })
      }))}
    />
  )
}

/** Places someone in a Choir they do not belong to yet, or gives a Choir member a Section. */
export function PlaceSingerDialog({
  person,
  choirs,
  today,
  trigger
}: {
  person: Person
  choirs: ChoirStructure[]
  today: string
  trigger: ReactElement
}) {
  const t = useTranslations("OrgAdmin.choirs")
  const suggested = choirs.find((choir) => voiceOptions(choir).some(({ voice }) => person.voices.includes(voice)))
  const [choirId, setChoirId] = useState((suggested ?? choirs[0])?.id ?? "")
  const choir = choirs.find(({ id }) => id === choirId)
  const firstVoice = (candidate: ChoirStructure | undefined) => {
    const voices = candidate ? voiceOptions(candidate).map(({ voice }) => voice) : []
    return voices.find((voice) => person.voices.includes(voice)) ?? voices[0] ?? ""
  }
  const [voice, setVoice] = useState<string>(firstVoice(choir))
  if (!choir) return null
  return (
    <GroupCommandDialog
      trigger={trigger}
      title={t("placeTitle", { name: person.name })}
      description={person.voices.length > 0 ? t("declares", { voices: person.voices.join(", ") }) : undefined}
      action={placeSingerAction}
      submitLabel={t("place")}
    >
      <input type="hidden" name="userId" value={person.id} />
      <SelectField
        label={t("choir")}
        name="choirId"
        value={choirId}
        onValueChange={(next) => {
          setChoirId(next)
          setVoice(firstVoice(choirs.find(({ id }) => id === next)))
        }}
        required
        options={choirs.map(({ id, name }) => ({ value: id, label: name }))}
      />
      <VoiceField choir={choir} value={voice} onChange={setVoice} />
      <DateField label={t("firstDay")} name="startDate" defaultValue={today} required />
    </GroupCommandDialog>
  )
}

/** Says which Positions a change ends, and tells the command that the Admin knows. */
function EndedPositions({ appointments }: { appointments: DependentAppointment[] }) {
  const t = useTranslations("OrgAdmin.choirs")
  const labels = useTranslations("Groups.positionLabels")
  if (appointments.length === 0) return null
  const positions = appointments.map(({ positionCode }) => labels(positionCodeKey(positionCode))).join(", ")
  return (
    <>
      <Notice>{t("endsPositions", { positions })}</Notice>
      <input type="hidden" name="endAppointments" value="true" />
    </>
  )
}

export function ChangeVoiceDialog({
  person,
  placement,
  choir,
  dependents,
  today
}: {
  person: Person
  placement: SingerPlacement
  choir: ChoirStructure
  dependents: DependentAppointment[]
  today: string
}) {
  const t = useTranslations("OrgAdmin.choirs")
  const [voice, setVoice] = useState<string>(placement.voice)
  const section = voiceOptions(choir).find((option) => option.voice === (voice as VoiceDivision))?.section
  const moves = section !== undefined && section.id !== placement.sectionId
  const ended = moves
    ? dependents.filter(({ userId, contextGroupId }) => userId === person.id && contextGroupId === placement.sectionId)
    : []
  return (
    <GroupCommandDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          {t("changeVoice")}
        </Button>
      }
      title={t("changeVoiceTitle", { name: person.name })}
      description={t("changeVoiceDescription")}
      action={changeVoiceAction}
      submitLabel={t(moves ? "move" : "changeVoice")}
    >
      <input type="hidden" name="userId" value={person.id} />
      <input type="hidden" name="choirId" value={choir.id} />
      <VoiceField choir={choir} value={voice} onChange={setVoice} />
      {moves ? <Notice>{t("movesTo", { section: section.name })}</Notice> : null}
      <EndedPositions appointments={ended} />
      <DateField label={t("from")} name="startDate" defaultValue={today} min={placement.startDate} required />
    </GroupCommandDialog>
  )
}

export function LeaveChoirDialog({
  person,
  choir,
  dependents,
  today
}: {
  person: Person
  choir: { id: string; name: string; since: string }
  dependents: DependentAppointment[]
  today: string
}) {
  const t = useTranslations("OrgAdmin.choirs")
  const ended = dependents.filter(
    ({ userId, contextType, contextGroupId, choirId }) =>
      userId === person.id && (contextType === GroupType.Choir ? contextGroupId : choirId) === choir.id
  )
  return (
    <GroupCommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("leave", { choir: choir.name })}
        </Button>
      }
      title={t("leaveTitle", { name: person.name, choir: choir.name })}
      description={t("leaveDescription")}
      action={leaveChoirAction}
      submitLabel={t("leave", { choir: choir.name })}
      destructive
    >
      <input type="hidden" name="userId" value={person.id} />
      <input type="hidden" name="choirId" value={choir.id} />
      <EndedPositions appointments={ended} />
      <DateField label={t("lastDay")} name="lastDay" defaultValue={today} min={choir.since} required />
    </GroupCommandDialog>
  )
}
