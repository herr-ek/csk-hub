"use client"

import Link from "next/link"
import { useFormatter, useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/base/sheet"
import type { ChoirStructure, DependentAppointment, Person } from "../../roster-reads"
import { ChangeVoiceDialog, LeaveChoirDialog, PlaceSingerDialog } from "./SingerDialogs"

/** Everything about where one person sings, and the ways to change it. */
export function SingerSheet({
  person,
  onClose,
  choirs,
  dependents,
  today
}: {
  person: Person | undefined
  onClose: () => void
  choirs: ChoirStructure[]
  dependents: DependentAppointment[]
  today: string
}) {
  const t = useTranslations("OrgAdmin.choirs")
  const format = useFormatter()
  const date = (value: string) => format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: "medium" })
  return (
    <Sheet open={person !== undefined} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="overflow-y-auto">
        {person ? (
          <>
            <SheetHeader>
              <SheetTitle>{person.name}</SheetTitle>
              <SheetDescription>
                {person.voices.length > 0 ? t("sings", { voices: person.voices.join(", ") }) : t("singsNothing")}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-6 px-6 pb-6">
              {person.choirs.map((membership) => {
                const choir = choirs.find(({ id }) => id === membership.id)
                const placement = person.placements.find(({ choirId }) => choirId === membership.id)
                const planned = person.planned.filter(({ choirId }) => choirId === membership.id)
                if (!choir) return null
                return (
                  <section key={membership.id} className="flex flex-col gap-3 rounded-2xl border p-4">
                    <div>
                      <h3 className="font-medium">{choir.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {placement
                          ? t("placedIn", {
                              voice: placement.voice,
                              section: placement.sectionName,
                              date: date(membership.since)
                            })
                          : t("withoutSectionSince", { date: date(membership.since) })}
                      </p>
                      {planned.map((next) => (
                        <p key={next.membershipId} className="text-sm text-muted-foreground">
                          {t("plannedChange", {
                            voice: next.voice,
                            section: next.sectionName,
                            date: date(next.startDate)
                          })}
                        </p>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {placement ? (
                        <ChangeVoiceDialog
                          key={placement.membershipId + placement.voice}
                          person={person}
                          placement={placement}
                          choir={choir}
                          dependents={dependents}
                          today={today}
                        />
                      ) : (
                        <PlaceSingerDialog
                          person={person}
                          choirs={[choir]}
                          today={today}
                          trigger={
                            <Button type="button" variant="outline" size="sm">
                              {t("giveSection")}
                            </Button>
                          }
                        />
                      )}
                      <LeaveChoirDialog
                        person={person}
                        choir={{ ...membership, name: choir.name }}
                        dependents={dependents}
                        today={today}
                      />
                    </div>
                  </section>
                )
              })}
              {choirs.length > person.choirs.length ? (
                <PlaceSingerDialog
                  person={person}
                  choirs={choirs.filter(({ id }) => !person.choirs.some((own) => own.id === id))}
                  today={today}
                  trigger={
                    <Button type="button" variant="outline" className="self-start">
                      {t("joinChoir")}
                    </Button>
                  }
                />
              ) : null}
              <Link
                href={`/members/${encodeURIComponent(person.id)}`}
                className="text-sm text-muted-foreground underline underline-offset-4"
              >
                {t("profile")}
              </Link>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
