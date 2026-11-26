"use client"

import { PlusIcon, Undo2Icon, XIcon } from "lucide-react"
import Link from "next/link"
import { type ReactNode, startTransition, useActionState, useEffect, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { familyOf, VOICE_DIVISIONS, type VoiceDivision } from "@/features/voice/model"
import { IDLE } from "@/shared/forms/command-state"
import { DateField } from "@/shared/forms/fields"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/base/dialog"
import { FieldError } from "@/shared/ui/base/field"
import { NativeSelect, NativeSelectOption } from "@/shared/ui/base/native-select"
import { toast } from "@/shared/ui/base/toast"
import { cn } from "@/shared/utils"
import { tenureStatus, VOICE_FAMILIES } from "../../roster"
import type { GigGroup, Person, RosterMember } from "../../roster-reads"
import { useCommandErrorMessage } from "../group-command-dialog"
import { usePeople } from "../PeopleContext"
import { PersonDetail, PersonPicker } from "../PersonPicker"
import { Notice } from "../positions/PositionDialogs"
import { useShortDate } from "../positions/SlotRow"
import { refillGigGroupAction } from "./actions"

type Join = { person: Person; voice: VoiceDivision }

/** A gig group's singers by Voice. Editing gathers every change of a refill and saves them together. */
export function LineUp({ gigGroup }: { gigGroup: GigGroup }) {
  const t = useTranslations("OrgAdmin.gigGroups")
  const [editing, setEditing] = useState(false)
  if (editing) return <LineUpEditor gigGroup={gigGroup} onDone={() => setEditing(false)} />
  const voices = gigGroup.members.flatMap(({ voice }) => (voice ? [voice] : []))
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Balance voices={voices} />
        {gigGroup.active ? (
          <Button type="button" onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
        ) : null}
      </div>
      <VoiceColumns count={(voice) => voices.filter((own) => own === voice).length}>
        {(voice) => (
          <ul className="flex flex-col gap-1">
            {gigGroup.members
              .filter((member) => member.voice === voice)
              .map((member) => (
                <li key={member.membershipId}>
                  <MemberName member={member} leads={leads(gigGroup, member.userId)} />
                </li>
              ))}
          </ul>
        )}
      </VoiceColumns>
    </section>
  )
}

function LineUpEditor({ gigGroup, onDone }: { gigGroup: GigGroup; onDone: () => void }) {
  const t = useTranslations("OrgAdmin.gigGroups")
  const groups = useTranslations("Groups")
  const errorMessage = useCommandErrorMessage()
  const { people, today } = usePeople()
  const [date, setDate] = useState(today)
  const [leaving, setLeaving] = useState<string[]>([])
  const [voices, setVoices] = useState<Record<string, VoiceDivision>>({})
  const [joins, setJoins] = useState<Join[]>([])
  const [state, dispatch, pending] = useActionState(refillGigGroupAction, IDLE)

  useEffect(() => {
    if (state.status !== "success") return
    toast.add({ type: "success", title: groups("saved") })
    onDone()
  }, [state, groups, onDone])

  const voiceOf = (member: RosterMember) => voices[member.membershipId] ?? member.voice
  const staying = gigGroup.members.filter(({ membershipId }) => !leaving.includes(membershipId))
  const lineUp = [...staying.map(voiceOf), ...joins.map(({ voice }) => voice)].filter((voice) => voice !== null)
  const taken = new Set([...gigGroup.members.map(({ userId }) => userId), ...joins.map(({ person }) => person.id)])
  const leavingLeaders = gigGroup.members.filter(
    (member) => leaving.includes(member.membershipId) && leads(gigGroup, member.userId)
  )
  const changed = gigGroup.members.filter(
    (member) =>
      !leaving.includes(member.membershipId) &&
      voices[member.membershipId] !== undefined &&
      voices[member.membershipId] !== member.voice
  )
  const dirty = leaving.length > 0 || joins.length > 0 || changed.length > 0

  const save = () => {
    const formData = new FormData()
    formData.set("groupId", gigGroup.id)
    formData.set("date", date)
    for (const id of leaving) formData.append("leave", id)
    for (const member of changed) formData.append("voices", `${voices[member.membershipId]}:${member.membershipId}`)
    for (const { person, voice } of joins) formData.append("join", `${voice}:${person.id}`)
    startTransition(() => dispatch(formData))
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/40 bg-primary/5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-full sm:w-64">
            <DateField
              label={t("date")}
              description={t("dateHelp")}
              name="date"
              value={date}
              onValueChange={setDate}
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={save} disabled={pending || !dirty || date === ""}>
              {pending ? groups("saving") : t("save")}
            </Button>
          </div>
        </div>
        {leavingLeaders.map((member) => (
          <Notice key={member.membershipId}>{t("endsLeading", { name: member.name })}</Notice>
        ))}
        <FieldError>{state.status === "error" ? errorMessage(state.error) : undefined}</FieldError>
      </div>
      <Balance voices={lineUp} />
      <VoiceColumns count={(voice) => lineUp.filter((own) => own === voice).length}>
        {(voice) => (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2">
              {gigGroup.members
                .filter((member) => voiceOf(member) === voice)
                .map((member) => {
                  const isLeaving = leaving.includes(member.membershipId)
                  const person = people.find(({ id }) => id === member.userId)
                  const options = VOICE_DIVISIONS.filter(
                    (option) => option === member.voice || person?.voices.includes(option)
                  )
                  return (
                    <li key={member.membershipId} className="flex items-center gap-1">
                      <span
                        className={cn("min-w-0 flex-1 truncate", isLeaving && "text-muted-foreground line-through")}
                      >
                        {member.name}
                      </span>
                      {!isLeaving && options.length > 1 ? (
                        <NativeSelect
                          size="sm"
                          aria-label={t("voiceOf", { name: member.name })}
                          value={voice}
                          onChange={(event) =>
                            setVoices({ ...voices, [member.membershipId]: event.target.value as VoiceDivision })
                          }
                        >
                          {options.map((option) => (
                            <NativeSelectOption key={option} value={option}>
                              {option}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t(isLeaving ? "keep" : "takeOut", { name: member.name })}
                        onClick={() =>
                          setLeaving(
                            isLeaving
                              ? leaving.filter((id) => id !== member.membershipId)
                              : [...leaving, member.membershipId]
                          )
                        }
                      >
                        {isLeaving ? <Undo2Icon aria-hidden="true" /> : <XIcon aria-hidden="true" />}
                      </Button>
                    </li>
                  )
                })}
              {joins
                .filter((join) => join.voice === voice)
                .map(({ person }) => (
                  <li key={person.id} className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate font-medium text-primary">{person.name}</span>
                    <PersonDetail person={person} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("takeOut", { name: person.name })}
                      onClick={() => setJoins(joins.filter((join) => join.person.id !== person.id))}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </li>
                ))}
            </ul>
            <AddSingersDialog
              voice={voice}
              people={people.filter((person) => !taken.has(person.id) && person.voices.includes(voice))}
              onAdd={(added) => setJoins([...joins, ...added.map((person) => ({ person, voice }))])}
            />
          </div>
        )}
      </VoiceColumns>
    </section>
  )
}

/** Picks joiners for one Voice; they are only saved with the rest of the line-up. */
function AddSingersDialog({
  voice,
  people,
  onAdd
}: {
  voice: VoiceDivision
  people: Person[]
  onAdd: (people: Person[]) => void
}) {
  const t = useTranslations("OrgAdmin.gigGroups")
  const common = useTranslations("Common")
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="self-start" aria-label={t("addVoice", { voice })}>
            <PlusIcon aria-hidden="true" />
            {t("add")}
          </Button>
        }
      />
      <DialogContent className="max-h-[calc(100dvh-2rem)] min-h-0 overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>{t("addVoice", { voice })}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            onAdd(people.filter(({ id }) => picked.includes(id)))
            setPicked([])
            setOpen(false)
          }}
        >
          <PersonPicker label={t("eligible", { voice })} people={people} name="userIds" onPick={setPicked} multiple />
          <div className="flex gap-3">
            <Button type="submit">{t("add")}</Button>
            <DialogClose render={<Button type="button" variant="ghost" />}>{common("cancel")}</DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function VoiceColumns({
  count,
  children
}: {
  count: (voice: VoiceDivision) => number
  children: (voice: VoiceDivision) => ReactNode
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {VOICE_DIVISIONS.map((voice) => (
        <section
          key={voice}
          aria-label={voice}
          className={cn("flex min-h-28 flex-col gap-2 rounded-2xl border p-4", count(voice) === 0 && "border-dashed")}
        >
          <div className="flex items-baseline justify-between">
            <h3 className="font-heading text-lg font-semibold">{voice}</h3>
            <span className="text-sm text-muted-foreground tabular-nums">{count(voice)}</span>
          </div>
          {children(voice)}
        </section>
      ))}
    </div>
  )
}

/** Singers in each Voice family, as S 4 · A 3 · T 2 · B 4. */
export function Balance({ voices }: { voices: VoiceDivision[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {VOICE_FAMILIES.map((family) => {
        const count = voices.filter((voice) => familyOf(voice) === family).length
        return (
          <li key={family}>
            <Badge variant={count === 0 ? "destructive" : "secondary"} className="tabular-nums">
              {`${family} ${count}`}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}

function MemberName({ member, leads }: { member: RosterMember; leads: boolean }) {
  const t = useTranslations("OrgAdmin")
  const labels = useTranslations("Groups.positionLabels")
  const { today } = usePeople()
  const date = useShortDate()
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/members/${encodeURIComponent(member.userId)}`} className="underline-offset-4 hover:underline">
        {member.name}
      </Link>
      {leads ? <Badge variant="outline">{labels("GigLeader")}</Badge> : null}
      {tenureStatus(member, today) === "planned" ? (
        <span className="text-xs text-muted-foreground">
          {t("positions.startsOn", { date: date(member.startDate) })}
        </span>
      ) : member.endDate ? (
        <span className="text-xs text-muted-foreground">{t("gigGroups.leaves", { date: date(member.endDate) })}</span>
      ) : null}
    </span>
  )
}

function leads(gigGroup: GigGroup, userId: string) {
  return gigGroup.leader.holders.some((holder) => holder.userId === userId)
}
