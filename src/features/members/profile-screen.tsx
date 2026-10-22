import { ArrowLeft, Award, MessageCircle, Music2, PencilLine, Settings, Users } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { conversationPath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { positionCodeKey, shiftDate } from "@/core/org-structure"
import { StartConversationDialog } from "@/features/messaging"
import { Badge } from "@/shared/ui/base/badge"
import { buttonVariants } from "@/shared/ui/base/button"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { ChoirCard, MemberGroupsCard } from "./affiliation-cards"
import { MemberAvatar } from "./member-avatar"
import { getProfile } from "./query"

type ProfileData = Awaited<ReturnType<typeof getProfile>>
type Profile = ProfileData["profile"]

export async function MemberProfileScreen({ memberId }: { memberId?: string }) {
  const [data, t] = await Promise.all([getProfile(memberId), getTranslations("MemberProfiles")])
  const { profile } = data
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href={ROUTES.members}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("directoryTitle")}
      </Link>
      <ProfileHeader data={data} />
      <ProfilePositions positions={profile.positions} />
      {data.canManageOrganisation ? <AdminParticipationHistory records={data.managementRecords} /> : null}
      <ProfileChoirs choirs={profile.choirs} />
      <ProfileGroups groups={profile.groups} otherGroups={profile.otherGroups} />
      <ProfileVoices capabilities={profile.capabilities} />
    </main>
  )
}

async function AdminParticipationHistory({ records }: { records: ProfileData["managementRecords"] }) {
  const [t, positionLabel] = await Promise.all([
    getTranslations("MemberProfiles"),
    getTranslations("Groups.positionLabels")
  ])
  if (!records) return null
  const entries = [
    ...records.appointments.map((item) => ({
      key: item.id,
      label: `${positionLabel(positionCodeKey(item.positionCode))} · ${item.contextName}`,
      start: item.startDate,
      end: item.endDate ? shiftDate(item.endDate, -1) : null,
      groupId: item.contextGroupId,
      kind: t("appointmentRecord")
    })),
    ...records.memberships.map((item) => ({
      key: item.id,
      label: item.groupName,
      start: item.startDate,
      end: item.endDate ? shiftDate(item.endDate, -1) : null,
      groupId: item.groupId,
      kind: t("membershipRecord")
    }))
  ]
  return (
    <section aria-labelledby="admin-participation-title">
      <h2 id="admin-participation-title" className="mb-3 font-heading text-xl font-semibold">
        {t("adminParticipation")}
      </h2>
      {entries.length ? (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
            >
              <span>
                {t("participationRecord", {
                  kind: entry.kind,
                  label: entry.label,
                  start: entry.start,
                  end: entry.end ?? t("ongoing")
                })}
              </span>
              <Link className="underline underline-offset-4" href={`${ROUTES.adminOrgStructure}/${entry.groupId}`}>
                {t("manageRecord")}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noAdminParticipation")}</p>
      )}
      <Link className="mt-3 inline-block text-sm underline underline-offset-4" href={ROUTES.adminOrgStructureGroups}>
        {t("manageAllGroups")}
      </Link>
    </section>
  )
}

async function ProfileHeader({ data }: { data: ProfileData }) {
  const { profile } = data
  const t = await getTranslations("MemberProfiles")
  return (
    <Card className="relative bg-linear-to-br from-primary/8 via-card to-card">
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <MemberAvatar name={profile.name} image={profile.image} large />
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("association")}</p>
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
        <ProfileActions data={data} />
      </CardContent>
    </Card>
  )
}

async function ProfileActions({ data }: { data: ProfileData }) {
  const { profile, canMessage, canEditProfile, messageConversationId } = data
  const t = await getTranslations("MemberProfiles")
  return (
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
        <Link href={conversationPath(messageConversationId)} className={buttonVariants()}>
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
  )
}

async function ProfilePositions({ positions }: { positions: Profile["positions"] }) {
  if (positions.length === 0) return null
  const [t, positionLabel] = await Promise.all([
    getTranslations("MemberProfiles"),
    getTranslations("Groups.positionLabels")
  ])
  return (
    <section aria-labelledby="positions-title">
      <h2 id="positions-title" className="mb-4 flex items-center gap-2 font-heading text-xl font-semibold">
        <Award className="size-5 text-primary" aria-hidden="true" />
        {t("positions")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {positions.map((position) => (
          <Card key={position.id} size="sm">
            <CardContent>
              <h3 className="font-semibold">
                {position.positionCode ? positionLabel(positionCodeKey(position.positionCode)) : position.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  position.contextName,
                  ...position.groups.filter((group) => group.id !== position.contextGroupId).map((group) => group.name)
                ].join(", ")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

async function ProfileChoirs({ choirs }: { choirs: Profile["choirs"] }) {
  const t = await getTranslations("MemberProfiles")
  return (
    <section aria-labelledby="choirs-title">
      <h2 id="choirs-title" className="mb-4 flex items-center gap-2 font-heading text-xl font-semibold">
        <Music2 className="size-5 text-primary" aria-hidden="true" />
        {t("choirs")}
      </h2>
      {choirs.length ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {choirs.map((choir) => (
            <ChoirCard key={choir.groupId} choir={choir} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noChoirs")}</p>
      )}
    </section>
  )
}

async function ProfileGroups({ groups, otherGroups }: Pick<Profile, "groups" | "otherGroups">) {
  const t = await getTranslations("MemberProfiles")
  return (
    <>
      {groups.length ? (
        <section aria-labelledby="groups-title">
          <h2 id="groups-title" className="mb-4 flex items-center gap-2 font-heading text-xl font-semibold">
            <Users className="size-5 text-primary" aria-hidden="true" />
            {t("groups")}
          </h2>
          <MemberGroupsCard groups={groups} />
        </section>
      ) : null}
      {otherGroups.length ? (
        <section aria-labelledby="other-groups-title">
          <h2 id="other-groups-title" className="mb-4 font-heading text-xl font-semibold">
            {t("otherGroups")}
          </h2>
          <MemberGroupsCard groups={otherGroups} />
        </section>
      ) : null}
    </>
  )
}

async function ProfileVoices({ capabilities }: { capabilities: Profile["capabilities"] }) {
  const t = await getTranslations("MemberProfiles")
  return (
    <section aria-labelledby="voices-title">
      <h2 id="voices-title" className="mb-4 font-heading text-xl font-semibold">
        {t("canSing")}
      </h2>
      <Card size="sm">
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">{t("selfReported")}</p>
          {capabilities.length ? (
            <ul className="flex flex-wrap gap-2">
              {capabilities.map((voice) => (
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
