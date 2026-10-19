import { ChevronLeft, ChevronRight } from "lucide-react"
import Form from "next/form"
import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Input } from "@/shared/ui/base/input"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { DirectorySearchButton } from "./directory-search-button"
import { MemberAvatar } from "./member-avatar"
import { getDirectory } from "./query"

export async function MemberDirectoryScreen({
  searchParams
}: {
  searchParams: Promise<{ query?: string | string[]; page?: string | string[] }>
}) {
  const params = await searchParams
  const [{ members, query, page, totalPages, total }, t] = await Promise.all([
    getDirectory({
      query: typeof params.query === "string" ? params.query : "",
      page: typeof params.page === "string" ? Number(params.page) : 1
    }),
    getTranslations("MemberProfiles")
  ])
  const pagePath = (page: number) =>
    `${ROUTES.members}?${new URLSearchParams({ ...(query ? { query } : {}), page: String(page) })}`
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("association")}</p>
        <h1 className="font-heading text-3xl font-semibold">{t("directoryTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("directoryDescription")}</p>
      </div>
      <Form action={ROUTES.members} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="member-search" className="mb-2 block text-sm font-medium">
            {t("searchLabel")}
          </label>
          <Input
            id="member-search"
            name="query"
            type="search"
            maxLength={200}
            defaultValue={query}
            key={query}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <DirectorySearchButton />
        {query ? (
          <Link href={ROUTES.members} className={buttonVariants({ variant: "outline" })}>
            {t("clearSearch")}
          </Link>
        ) : null}
      </Form>
      <p className="text-sm text-muted-foreground" role="status">
        {t("memberCount", { count: total })}
      </p>
      {members.length ? (
        <ul className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                href={memberProfilePath(member.id)}
                className="block h-full rounded-4xl outline-offset-4 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Card className="h-full min-h-40">
                  <CardContent className="flex items-start gap-4">
                    <MemberAvatar name={member.name} image={member.image} />
                    <div className="min-w-0">
                      <h2 className="font-heading font-semibold wrap-break-word">{member.name}</h2>
                      <p className="mt-1 min-h-4 text-xs text-muted-foreground wrap-break-word">
                        {member.username ? t("username", { username: member.username }) : null}
                      </p>
                      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                        {member.choirs.map((choir) => (
                          <li key={choir.id}>
                            {choir.section
                              ? t("choirSection", { choir: choir.name, section: choir.section })
                              : choir.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            {t(query ? "noResults" : "emptyDirectory")}
          </CardContent>
        </Card>
      )}
      {totalPages > 1 ? (
        <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pagePath(page - 1)} className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted-foreground">{t("pageOf", { page, total: totalPages })}</p>
          {page < totalPages ? (
            <Link href={pagePath(page + 1)} className={buttonVariants({ variant: "outline" })}>
              {t("next")}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  )
}

export function MemberDirectorySkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-4xl" />
        ))}
      </div>
    </main>
  )
}
