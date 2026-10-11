import { ArrowLeft, Award, MessageCircle, Music2, PencilLine, Settings, Users } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { ROUTES } from "@/core/navigation/site"
import { StartConversationDialog } from "@/features/messaging"
import { Badge } from "@/shared/ui/base/badge"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { ChoirCard, MemberGroupsCard } from "./affiliation-cards"
import { MemberAvatar } from "./member-avatar"
import { getProfile } from "./query"

export async function MemberProfileScreen({ memberId }: { memberId?: string }) {
  const [{ profile, canMessage, canEditProfile, messageConversationId }, t] = await Promise.all([
    getProfile(memberId),
    getTranslations("MemberProfiles")
  ])
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href={ROUTES.members}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("directoryTitle")}
      </Link>
      <Card className="relative bg-linear-to-br from-primary/8 via-card to-card">
        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <MemberAvatar name={profile.name} image={profile.image} large />
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("association")}
            </p>
            <h1 className="font-heading text-3xl font-semibold wrap-break-word sm:text-4xl">{profile.name}</h1>
            {profile.username ? (
              <p className="mt-2 text-muted-foreground wrap-break-word">
                {t("username", { username: profile.username })}
              </p>
            ) : null}
            {profile.email ? (
              <p className="mt-2 text-sm text-muted-foreground wrap-break-word">
                <span className="sr-only">{t("email")}</span>
                {profile.email}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEditProfile ? (
              <Link href={ROUTES.accountEditProfile} className={buttonVariants()}>
                <PencilLine className="size-4" aria-hidden="true" />
                {t("editProfile")}
              </Link>
            ) : null}
            {profile.isOwn ? (
              <Link href={ROUTES.accountSettings} className={buttonVariants({ variant: "outline" })}>
                <Settings className="size-4" aria-hidden="true" />
                {t("settings")}
              </Link>
            ) : null}
            {canMessage && messageConversationId ? (
              <Link href={`${ROUTES.messages}/${messageConversationId}`} className={buttonVariants()}>
                <MessageCircle className="size-4" aria-hidden="true" />
                {t("message")}
              </Link>
            ) : canMessage ? (
              <StartConversationDialog initialMember={{ id: profile.id, name: profile.name }}>
                <MessageCircle className="size-4" aria-hidden="true" />
                {t("message")}
              </StartConversationDialog>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {profile.positions.length ? (
        <section aria-labelledby="positions-title">
          <h2 id="positions-title" className="mb-4 flex items-center gap-2 font-heading text-xl font-semibold">
            <Award className="size-5 text-primary" aria-hidden="true" />
            {t("positions")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {profile.positions.map((position) => (
              <Card key={position.id} size="sm">
                <CardContent>
                  <h3 className="font-semibold">{position.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {position.groups
                      .map((group) =>
                        group.choirName ? t("groupContext", { group: group.name, choir: group.choirName }) : group.name
                      )
                      .join(", ")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="choirs-title">
        <h2 id="choirs-title" className="mb-4 flex items-center gap-2 font-heading text-xl font-semibold">
          <Music2 className="size-5 text-primary" aria-hidden="true" />
          {t("choirs")}
        </h2>
        {profile.choirs.length ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {profile.choirs.map((choir) => (
              <ChoirCard key={choir.groupId} choir={choir} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noChoirs")}</p>
        )}
      </section>
      {profile.groups.length ? (
        <section aria-labelledby="groups-title">
          <h2 id="groups-title" className="mb-4 flex items-center gap-2 font-heading text-xl font-semibold">
            <Users className="size-5 text-primary" aria-hidden="true" />
            {t("groups")}
          </h2>
          <MemberGroupsCard groups={profile.groups} />
        </section>
      ) : null}
      {profile.otherGroups.length ? (
        <section aria-labelledby="other-groups-title">
          <h2 id="other-groups-title" className="mb-4 font-heading text-xl font-semibold">
            {t("otherGroups")}
          </h2>
          <MemberGroupsCard groups={profile.otherGroups} showContext />
        </section>
      ) : null}
      <section aria-labelledby="voices-title">
        <h2 id="voices-title" className="mb-4 font-heading text-xl font-semibold">
          {t("canSing")}
        </h2>
        <Card size="sm">
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">{t("selfReported")}</p>
            {profile.capabilities.length ? (
              <ul className="flex flex-wrap gap-2">
                {profile.capabilities.map((voice) => (
                  <li key={voice}>
                    <Badge variant="outline" className="h-8 px-3 text-sm">
                      {voice}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("notRecorded")}</p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

export function MemberProfileSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Card>
        <CardContent className="flex items-center gap-6">
          <Skeleton className="size-24 shrink-0 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-56 rounded-4xl" />
        <Skeleton className="h-56 rounded-4xl" />
      </div>
      <Skeleton className="h-24 rounded-4xl" />
    </main>
  )
}
