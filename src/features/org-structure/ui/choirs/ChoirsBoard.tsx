"use client"

import { type ReactNode, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { divisionsOf, isVoiceDivision, VOICE_DIVISIONS } from "@/features/voice/model"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Input } from "@/shared/ui/base/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/base/tabs"
import { cskPlacement, isUnplaced } from "../../roster"
import type { ChoirStructure, DependentAppointment, Person } from "../../roster-reads"
import { HistoryLink } from "../HistoryLink"
import { PlaceSingerDialog } from "./SingerDialogs"
import { SingerSheet } from "./SingerSheet"

type BoardProps = { choirs: ChoirStructure[]; people: Person[]; dependents: DependentAppointment[]; today: string }

/** Every singer by Choir and Section, or all of CSK as one choir; picking one opens their placements. */
export function ChoirsBoard({ choirs, people, dependents, today }: BoardProps) {
  const t = useTranslations("OrgAdmin.choirs")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string>()
  const needle = search.trim().toLowerCase()
  const matches = (person: Person) => person.name.toLowerCase().includes(needle)
  const unplaced = people.filter(isUnplaced)

  return (
    <Tabs defaultValue="choirs" className="gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TabsList aria-label={t("view")}>
          <TabsTrigger value="choirs">{t("byChoir")}</TabsTrigger>
          <TabsTrigger value="csk">{t("allCsk")}</TabsTrigger>
        </TabsList>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="w-full sm:w-64"
        />
      </div>
      {unplaced.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <h2 className="font-medium">{t("unplaced", { count: unplaced.length })}</h2>
          <ul className="flex max-h-64 flex-col divide-y overflow-y-auto">
            {unplaced.filter(matches).map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  {person.name} <span className="text-xs text-muted-foreground">{person.voices.join(", ")}</span>
                </span>
                <PlaceSingerDialog
                  person={person}
                  choirs={choirs}
                  today={today}
                  trigger={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={t("placeTitle", { name: person.name })}
                    >
                      {t("place")}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <TabsContent value="choirs" className="grid items-start gap-4 lg:grid-cols-3">
        {choirs.map((choir) => (
          <ChoirColumn key={choir.id} choir={choir} people={people} matches={matches} onSelect={setSelectedId} />
        ))}
      </TabsContent>
      <TabsContent value="csk">
        <CskView people={people} matches={matches} onSelect={setSelectedId} />
      </TabsContent>
      <SingerSheet
        person={people.find(({ id }) => id === selectedId)}
        onClose={() => setSelectedId(undefined)}
        choirs={choirs}
        dependents={dependents}
        today={today}
      />
    </Tabs>
  )
}

type ListProps = { people: Person[]; matches: (person: Person) => boolean; onSelect: (userId: string) => void }

function ChoirColumn({ choir, people, matches, onSelect }: ListProps & { choir: ChoirStructure }) {
  const t = useTranslations("OrgAdmin.choirs")
  const members = people.filter(({ choirs }) => choirs.some(({ id }) => id === choir.id))
  const placed = members.flatMap((person) => {
    const placement = person.placements.find(({ choirId }) => choirId === choir.id)
    return placement ? [{ person, placement }] : []
  })
  const withoutSection = members.filter((person) => !person.placements.some(({ choirId }) => choirId === choir.id))
  const list = (entries: { person: Person; detail?: string }[]) => (
    <ul className="flex flex-col">
      {entries
        .filter(({ person }) => matches(person))
        .map(({ person, detail }) => (
          <li key={person.id}>
            <SingerButton person={person} onSelect={onSelect}>
              {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
            </SingerButton>
          </li>
        ))}
    </ul>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between">
          <span className="flex items-center gap-1">
            {choir.name}
            <HistoryLink groupId={choir.id} name={choir.name} />
          </span>
          <span className="text-sm font-normal text-muted-foreground">{t("singers", { count: placed.length })}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {choir.sections.map((section) => {
          const singers = placed.filter(({ placement }) => placement.sectionId === section.id)
          const divided = isVoiceDivision(section.voice)
          return (
            <section key={section.id} aria-labelledby={`section-${section.id}`}>
              <div className="flex items-baseline justify-between gap-2 border-b pb-1">
                <div className="flex items-center gap-1">
                  <h3 id={`section-${section.id}`} className="font-medium">
                    {section.name}
                  </h3>
                  <HistoryLink groupId={section.id} name={section.name} />
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {divided
                    ? singers.length
                    : t("divisionCounts", {
                        count: singers.length,
                        divisions: divisionsOf(section.voice as "S" | "A" | "T" | "B")
                          .map(
                            (voice) => `${voice} ${singers.filter(({ placement }) => placement.voice === voice).length}`
                          )
                          .join(" · ")
                      })}
                </p>
              </div>
              {list(
                singers.map(({ person, placement }) => ({ person, detail: divided ? undefined : placement.voice }))
              )}
            </section>
          )
        })}
        {withoutSection.length > 0 ? (
          <section>
            <div className="flex items-baseline justify-between border-b pb-1">
              <h3 className="font-medium text-muted-foreground">{t("withoutSection")}</h3>
              <p className="text-sm text-muted-foreground tabular-nums">{withoutSection.length}</p>
            </div>
            {list(withoutSection.map((person) => ({ person })))}
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** All of CSK as one choir: each singer takes the one place `cskPlacement` gives them. */
function CskView({ people, matches, onSelect }: ListProps) {
  const t = useTranslations("OrgAdmin.choirs")
  const singers = people.flatMap((person) => {
    const placement = cskPlacement(person.placements)
    return placement ? [{ person, ...placement }] : []
  })
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("cskTotal", { count: singers.length })}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {VOICE_DIVISIONS.map((voice) => {
          const inVoice = singers.filter(({ counted }) => counted.voice === voice)
          return (
            <Card key={voice} size="sm">
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between">
                  <h3>{voice}</h3>
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">{inVoice.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col">
                  {inVoice
                    .filter(({ person }) => matches(person))
                    .map(({ person, counted, others }) => (
                      <li key={person.id}>
                        <SingerButton person={person} onSelect={onSelect}>
                          <span className="flex flex-wrap items-center justify-end gap-1">
                            <Badge variant="secondary">{counted.choirName}</Badge>
                            {others.map((other) => (
                              <span key={other.membershipId} className="text-xs text-muted-foreground">
                                {t("also", { voice: other.voice, choir: other.choirName })}
                              </span>
                            ))}
                          </span>
                        </SingerButton>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function SingerButton({
  person,
  onSelect,
  children
}: {
  person: Person
  onSelect: (userId: string) => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(person.id)}
      className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 truncate">{person.name}</span>
      {children}
    </button>
  )
}
