import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { getFormatter, getTranslations } from "@/core/i18n/server"
import { memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { MemberAvatar } from "../member-avatar"
import { getCareer } from "../query"
import { CareerTimeline } from "./CareerTimeline"

export async function MemberCareerScreen({ memberId }: { memberId?: string }) {
  const [career, t, format] = await Promise.all([getCareer(memberId), getTranslations("MemberCareer"), getFormatter()])
  const start = career.records[0]?.startDate
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={career.isOwn ? ROUTES.account : memberProfilePath(career.person.id)}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToProfile")}
      </Link>
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <MemberAvatar name={career.person.name} image={career.person.image} large />
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-muted-foreground">{t(career.isOwn ? "myTitle" : "title")}</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight wrap-break-word sm:text-5xl">
            {career.person.name}
          </h1>
          {start ? (
            <p className="mt-3 text-muted-foreground">
              {t("range", {
                start: format.dateTime(new Date(`${start}T12:00:00Z`), {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC"
                })
              })}
            </p>
          ) : null}
        </div>
      </header>
      <CareerTimeline records={career.records} through={career.through} />
    </main>
  )
}

export function MemberCareerSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-28 w-full max-w-xl" />
      <Skeleton className="h-14" />
      <Skeleton className="h-80" />
    </main>
  )
}
